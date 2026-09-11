import 'dotenv/config';
import { db } from '../apps/api/src/infra/database';
import { FinanceService } from '../apps/api/src/finance/service';
import { ids, demoDashboard } from '@settleup/domain/src/fixtures';
import { periodRange } from '@settleup/domain';
const data = demoDashboard();
const people = [{ id: ids.Utkarsh, name: 'Utkarsh Mehta', phone: '+919876543210' }, { id: ids.rohan, name: 'Rohan Shah', phone: '+919876543211' }, { id: ids.meera, name: 'Meera Iyer', phone: '+919876543212' }, { id: ids.kabir, name: 'Kabir Sethi', phone: '+919876543213' }];
for (const p of people) await db.user.upsert({ where: { id: p.id }, create: { id: p.id, profile: { create: { name: p.name } }, phone: { create: { phone: p.phone, verifiedAt: new Date() } }, notifications: { create: {} } }, update: {} });
for (const p of people) for (const friend of people.filter(f => f.id !== p.id)) await db.contactPeer.upsert({ where: { ownerId_phone: { ownerId: p.id, phone: friend.phone } }, create: { ownerId: p.id, name: friend.name, phone: friend.phone, linkedUserId: friend.id }, update: {} });
for (const t of data.tags) await db.tag.upsert({ where: { id: t.id }, create: { id: t.id, ownerId: ids.Utkarsh, name: t.name, color: t.color }, update: {} });
for (const l of data.ledgers) await db.group.upsert({ where: { id: l.id }, create: { id: l.id, name: l.name, description: l.description, members: { create: l.members.map(m => ({ userId: m.id, role: m.id === ids.Utkarsh ? 'OWNER' : 'MEMBER' })) }, ledgers: { create: { id: l.id, name: l.name, currency: l.currency, members: { create: l.members.map(m => ({ userId: m.id, role: m.id === ids.Utkarsh ? 'OWNER' : 'MEMBER' })) } } } }, update: {} });
const service = new FinanceService();
for (const t of data.transactions) {
    const already = await db.transaction.findUnique({ where: { sourceId_idempotencyKey: { sourceId: ids.Utkarsh, idempotencyKey: t.id } } }); if (already) continue;
    await service.create(ids.Utkarsh, { idempotencyKey: t.id, title: t.title, amountMinor: t.amountMinor, currency: t.currency, type: t.type as 'PERSONAL_EXPENSE' | 'SHARED_EXPENSE' | 'LOAN', status: t.status as 'SETTLED' | 'PENDING_LOAN', occurredAt: t.occurredAt, notes: t.notes ?? undefined, ledgerId: t.ledgerId ?? undefined, destinationId: t.destinationId ?? undefined, tagIds: t.tagIds, splitMethod: 'EQUAL', participants: t.allocations.map(a => ({ userId: a.userId })) });
}
await service.create(ids.meera, { idempotencyKey: '70000000-0000-4000-8000-000000000001', title: 'Home supplies', amountMinor: 435000, currency: 'INR', type: 'SHARED_EXPENSE', status: 'SETTLED', occurredAt: '2026-09-08T10:00:00.000Z', ledgerId: ids.home, tagIds: [], splitMethod: 'EQUAL', participants: [ids.Utkarsh, ids.rohan, ids.meera].map(userId => ({ userId })) });
for (const g of data.goals) { const { start, end } = periodRange('MONTH', 'Asia/Kolkata'); await db.goal.upsert({ where: { id: g.id }, create: { id: g.id, ownerId: ids.Utkarsh, name: g.name, amountMinor: g.amountMinor, currency: g.currency, start, end, period: g.period, scopes: { create: g.tagIds.map(tagId => ({ tagId })) } }, update: {} }); }
console.log('Seeded fictional test accounts and auditable ledger entries.');
await db.$disconnect();
