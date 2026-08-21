import assert from 'node:assert/strict';
import test from 'node:test';
import type { Task } from '../src/types/task';
import { isValidTemplateArray } from '../src/types/template';
import { buildTaskTemplate, instantiateTaskTemplate, mergeTemplates } from '../src/utils/taskTemplates';

const task = (overrides: Partial<Task> = {}): Task => ({
    id: 'task-1',
    title: 'Read',
    time: '08:00',
    duration: '30m',
    timeBlock: 'morning',
    completed: false,
    completedAt: null,
    priority: 'medium',
    createdAt: '2026-08-20T08:00:00.000Z',
    date: '2026-08-20',
    recurrence: 'none',
    reminderEnabled: true,
    checklistItems: [{ id: 'source-check', text: 'Chapter one', completed: true }],
    ...overrides,
});

test('one selected task becomes a task template without completion or checklist identity', () => {
    const template = buildTaskTemplate('Morning reading', [task()], 'template-1', '2026-08-21T10:00:00.000Z');
    assert.equal(template.kind, 'task');
    assert.equal(template.items.length, 1);
    assert.equal(template.items[0].dayOffset, 0);
    assert.deepEqual(template.items[0].checklistItems, [{ text: 'Chapter one' }]);
    assert.equal('id' in template.items[0].checklistItems![0], false);
    assert.equal('completed' in template.items[0].checklistItems![0], false);
    assert.equal(isValidTemplateArray([template]), true);
});

test('several tasks become an ordered routine with day offsets from the first day', () => {
    const template = buildTaskTemplate('Two-day reset', [
        task({ id: 'later', title: 'Day two', date: '2026-08-22', time: '' }),
        task({ id: 'first', title: 'Day one', date: '2026-08-20', time: '18:00' }),
    ], 'template-2', '2026-08-21T10:00:00.000Z');

    assert.equal(template.kind, 'routine');
    assert.deepEqual(template.items.map(item => [item.title, item.dayOffset]), [
        ['Day one', 0],
        ['Day two', 2],
    ]);
    assert.equal(template.items[1].reminderEnabled, false);
    assert.equal(isValidTemplateArray([template]), true);
});

test('each routine run creates fresh checklist objects and schedules from its selected date', () => {
    const template = buildTaskTemplate('Independent', [task(), task({ id: 'two', title: 'Plan', date: '2026-08-21' })], 'template-3', '2026-08-21T10:00:00.000Z');
    let counter = 0;
    const first = instantiateTaskTemplate(template, '2026-09-01', () => `check-${++counter}`);
    const second = instantiateTaskTemplate(template, '2026-10-01', () => `check-${++counter}`);

    assert.deepEqual(first.map(item => item.date), ['2026-09-01', '2026-09-02']);
    assert.deepEqual(second.map(item => item.date), ['2026-10-01', '2026-10-02']);
    assert.notEqual(first[0].checklistItems![0].id, second[0].checklistItems![0].id);
    first[0].checklistItems![0].completed = true;
    assert.equal(second[0].checklistItems![0].completed, false);
    assert.equal(template.items[0].checklistItems![0].text, 'Chapter one');
});

test('template validation rejects duplicate ids and malformed routine spans', () => {
    const template = buildTaskTemplate('Valid', [task()], 'same', '2026-08-21T10:00:00.000Z');
    assert.equal(isValidTemplateArray([template, { ...template }]), false);
    assert.equal(isValidTemplateArray([{ ...template, kind: 'routine' }]), false);
    assert.equal(isValidTemplateArray([{ ...template, items: [{ ...template.items[0], dayOffset: 1 }] }]), false);
});

test('template merge is additive and current templates win id conflicts', () => {
    const current = buildTaskTemplate('Current', [task()], 'same', '2026-08-21T10:00:00.000Z');
    const conflict = { ...current, name: 'Incoming conflict' };
    const added = { ...current, id: 'new', name: 'Added' };
    const merged = mergeTemplates([current], [conflict, added]);
    assert.deepEqual(merged.map(template => template.name), ['Current', 'Added']);
});

test('template construction rejects an empty name or task selection', () => {
    assert.throws(
        () => buildTaskTemplate('   ', [task()], 'template-empty-name', '2026-08-21T10:00:00.000Z'),
        /template-name-required/,
    );
    assert.throws(
        () => buildTaskTemplate('Empty routine', [], 'template-empty-items', '2026-08-21T10:00:00.000Z'),
        /template-task-required/,
    );
});
