import { beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createAuthUser, service, signIn, testEmail, uniqueText, type Client } from './helpers';

let asAdmin: Client;
let asMember: Client;
let asOutsider: Client;
let categoryId: string;
let unitId: string;

beforeAll(async () => {
  const adminEmail = testEmail('lists-admin');
  const memberEmail = testEmail('lists-member');
  const outsiderEmail = testEmail('lists-outsider');
  const adminId = await createAuthUser(adminEmail);
  const memberId = await createAuthUser(memberEmail);
  await createAuthUser(outsiderEmail);
  const { error } = await service.from('profiles').insert([
    { id: adminId, display_name: 'Lists Admin', email: adminEmail, role: 'admin' },
    { id: memberId, display_name: 'Lists Member', email: memberEmail, role: 'member' },
  ]);
  if (error) throw error;
  asAdmin = await signIn(adminEmail);
  asMember = await signIn(memberEmail);
  asOutsider = await signIn(outsiderEmail);
  categoryId = (await service.from('item_categories').select('id').eq('code', 'PRT').single()).data!.id;
  unitId = (await service.from('units').select('id').eq('name', 'pcs').single()).data!.id;
});

const LISTS = ['item_categories', 'units', 'brands'] as const;

describe('the default lists exist', () => {
  it('has the original categories and units', async () => {
    const { data: categories } = await asMember.from('item_categories').select('name, code').order('sort_order');
    expect(categories?.slice(0, 4)).toEqual([
      { name: 'Part', code: 'PRT' },
      { name: 'Consumable', code: 'CON' },
      { name: 'Fluid', code: 'FLD' },
      { name: 'Other', code: 'OTH' },
    ]);
    const { data: units } = await asMember.from('units').select('name, whole_only').order('sort_order');
    expect(units?.slice(0, 5)).toEqual([
      { name: 'pcs', whole_only: true },
      { name: 'L', whole_only: false },
      { name: 'ml', whole_only: false },
      { name: 'kg', whole_only: false },
      { name: 'm', whole_only: false },
    ]);
  });
});

describe('signed out and non-members', () => {
  it.each(LISTS)('cannot read %s', async (table) => {
    const anon = await anonClient().from(table).select('*');
    expect(anon.error).not.toBeNull();
    const outsider = await asOutsider.from(table).select('*');
    expect(outsider.data).toEqual([]);
  });

  it('cannot add entries', async () => {
    const res = await asOutsider.from('brands').insert({ name: uniqueText('Evil'), code: 'EVIL' });
    expect(res.error).not.toBeNull();
  });
});

describe('members add, admins edit and delete', () => {
  it('a member can add a brand, a category and a unit', async () => {
    const brand = await asMember.from('brands').insert({ name: uniqueText('Brand'), code: uniqueText('B').replace(/[^A-Z0-9]/g, '').slice(-6) }).select().single();
    expect(brand.error).toBeNull();
    const category = await asMember.from('item_categories').insert({ name: uniqueText('Cat'), code: 'TST' }).select().single();
    expect(category.error).toBeNull();
    const unit = await asMember.from('units').insert({ name: uniqueText('u').slice(-10), whole_only: true }).select().single();
    expect(unit.error).toBeNull();
  });

  it('a member cannot rename or delete entries', async () => {
    const { data: brand } = await asAdmin.from('brands').insert({ name: uniqueText('Keep'), code: 'KEEP' }).select().single();
    const rename = await asMember.from('brands').update({ name: 'Hacked' }).eq('id', brand!.id).select();
    expect(rename.data ?? []).toEqual([]);
    const del = await asMember.from('brands').delete().eq('id', brand!.id).select();
    expect(del.data ?? []).toEqual([]);
    const { data: still } = await service.from('brands').select('name').eq('id', brand!.id).single();
    expect(still?.name).toBe(brand!.name);

    const renameUnit = await asMember.from('units').update({ name: 'xx' }).eq('id', unitId).select();
    expect(renameUnit.data ?? []).toEqual([]);
    const delCategory = await asMember.from('item_categories').delete().eq('id', categoryId).select();
    expect(delCategory.data ?? []).toEqual([]);
  });

  it('an admin can rename and delete unused entries', async () => {
    const { data: brand } = await asMember.from('brands').insert({ name: uniqueText('Temp'), code: 'TEMP' }).select().single();
    const rename = await asAdmin.from('brands').update({ name: brand!.name + ' X' }).eq('id', brand!.id).select();
    expect(rename.data).toHaveLength(1);
    const del = await asAdmin.from('brands').delete().eq('id', brand!.id).select();
    expect(del.data).toHaveLength(1);
  });

  it('entries that are in use cannot be deleted', async () => {
    const { data: brand } = await asAdmin.from('brands').insert({ name: uniqueText('Used'), code: 'USED' }).select().single();
    const item = await asMember
      .from('items')
      .insert({ name: 'Uses brand', category_id: categoryId, unit_id: unitId, brand_id: brand!.id, part_number: uniqueText('PN') })
      .select()
      .single();
    expect(item.error).toBeNull();
    const del = await asAdmin.from('brands').delete().eq('id', brand!.id);
    expect(del.error?.code).toBe('23503');
    const delUnit = await asAdmin.from('units').delete().eq('id', unitId);
    expect(delUnit.error?.code).toBe('23503');
  });
});

describe('uniqueness rules', () => {
  it('brand names are case-sensitive', async () => {
    const name = uniqueText('Casebrand').toLowerCase();
    const a = await asMember.from('brands').insert({ name, code: 'CASA' });
    expect(a.error).toBeNull();
    const b = await asMember.from('brands').insert({ name: name.toUpperCase(), code: 'CASB' });
    expect(b.error).toBeNull();
    const dup = await asMember.from('brands').insert({ name, code: 'CASC' });
    expect(dup.error?.code).toBe('23505');
  });

  it('brand and category codes are unique', async () => {
    const dup = await asMember.from('item_categories').insert({ name: uniqueText('Another'), code: 'PRT' });
    expect(dup.error?.code).toBe('23505');
    const lower = await asMember.from('item_categories').insert({ name: uniqueText('Lower'), code: 'abc' });
    expect(lower.error?.code).toBe('23514');
  });

  it('category names are unique ignoring case', async () => {
    const dup = await asMember.from('item_categories').insert({ name: 'part', code: 'PRX' });
    expect(dup.error?.code).toBe('23505');
  });

  it('part numbers are unique ignoring case', async () => {
    const pn = uniqueText('Uniq');
    const first = await asMember.from('items').insert({ name: 'First', category_id: categoryId, unit_id: unitId, part_number: pn });
    expect(first.error).toBeNull();
    const second = await asMember
      .from('items')
      .insert({ name: 'Second', category_id: categoryId, unit_id: unitId, part_number: pn.toLowerCase() });
    expect(second.error?.code).toBe('23505');
  });
});
