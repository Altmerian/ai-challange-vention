import { describe, it, expect } from 'vitest';
import { build, GRID_SIZE } from '../topicPickerBuilder.js';

function makeMaterials(n, difficulty = 'beginner') {
  return Array.from({ length: n }, (_, i) => ({
    short_id: `m${String(i).padStart(7, '0')}`,
    title: `Material ${i + 1}`,
    difficulty,
  }));
}

describe('topicPickerBuilder.build — empty state', () => {
  it('returns empty=true with the no-materials copy when input is []', () => {
    const out = build({ materials: [], page: 0, pageSize: 8 });
    expect(out.empty).toBe(true);
    expect(out.gridButtons).toBeNull();
    expect(out.paginationButtons).toBeNull();
    expect(out.totalPages).toBe(0);
    expect(out.html).toContain('&lt;URL&gt;');
    expect(out.html).not.toMatch(/<URL>/);
  });

  it('returns empty=true when materials is undefined / not an array', () => {
    expect(build({}).empty).toBe(true);
    expect(build({ materials: null }).empty).toBe(true);
    expect(build({ materials: 'nope' }).empty).toBe(true);
  });
});

describe('topicPickerBuilder.build — body rendering', () => {
  it('renders a numbered list with difficulty emojis', () => {
    const materials = [
      { short_id: 'm1', title: 'Easy', difficulty: 'beginner' },
      { short_id: 'm2', title: 'Mid', difficulty: 'intermediate' },
      { short_id: 'm3', title: 'Hard', difficulty: 'advanced' },
    ];
    const out = build({ materials, page: 0, pageSize: 8 });
    expect(out.html).toContain('1. 🟢 Easy');
    expect(out.html).toContain('2. 🟡 Mid');
    expect(out.html).toContain('3. 🔴 Hard');
  });

  it('htmlEscapes dynamic title content in the body (HTML parse mode)', () => {
    const materials = [
      { short_id: 'm1', title: 'List<T> & more', difficulty: 'beginner' },
    ];
    const out = build({ materials, page: 0, pageSize: 8 });
    expect(out.html).toContain('List&lt;T&gt; &amp; more');
    expect(out.html).not.toContain('List<T>');
  });

  it('omits the "Page N of M" line on single-page pickers', () => {
    const out = build({ materials: makeMaterials(3), page: 0, pageSize: 8 });
    expect(out.html).not.toMatch(/Page \d+ of \d+/);
  });

  it('includes the "Page N of M" line when paginated', () => {
    const out = build({ materials: makeMaterials(17), page: 1, pageSize: 8 });
    expect(out.html).toContain('Page 2 of 3');
  });
});

describe('topicPickerBuilder.build — grid (always 8 cells)', () => {
  it('fills 3 of 8 cells with materials and the remaining 5 with noop re-render', () => {
    const out = build({ materials: makeMaterials(3), page: 0, pageSize: 8 });
    expect(out.gridButtons).toHaveLength(GRID_SIZE);
    expect(out.gridButtons[0]).toEqual({ text: '1', callback_data: 'tp:m0000000' });
    expect(out.gridButtons[2]).toEqual({ text: '3', callback_data: 'tp:m0000002' });
    // Unused cells render a placeholder + a no-op re-render of the current page.
    for (let i = 3; i < 8; i++) {
      expect(out.gridButtons[i]).toEqual({ text: '⠀', callback_data: 'tpp:0' });
    }
  });

  it('fills all 8 cells when the page has exactly pageSize materials', () => {
    const out = build({ materials: makeMaterials(8), page: 0, pageSize: 8 });
    for (let i = 0; i < 8; i++) {
      expect(out.gridButtons[i].text).toBe(String(i + 1));
      expect(out.gridButtons[i].callback_data).toMatch(/^tp:/);
    }
  });

  it('slices materials per page', () => {
    const out = build({ materials: makeMaterials(17), page: 1, pageSize: 8 });
    expect(out.gridButtons[0].callback_data).toBe('tp:m0000008');
    expect(out.gridButtons[7].callback_data).toBe('tp:m0000015');
  });

  it('partial last page leaves only 1 active cell + 7 noop', () => {
    const out = build({ materials: makeMaterials(17), page: 2, pageSize: 8 });
    expect(out.gridButtons[0].callback_data).toBe('tp:m0000016');
    for (let i = 1; i < 8; i++) {
      expect(out.gridButtons[i].callback_data).toBe('tpp:2');
    }
  });
});

describe('topicPickerBuilder.build — pagination row (always 3 cells, wraparound)', () => {
  it('single-page picker uses dot placeholders + self-targeting callbacks', () => {
    const out = build({ materials: makeMaterials(3), page: 0, pageSize: 8 });
    expect(out.paginationButtons).toHaveLength(3);
    expect(out.paginationButtons[0]).toEqual({ text: '⠀', callback_data: 'tpp:0' });
    expect(out.paginationButtons[1]).toEqual({ text: 'Page 1/1', callback_data: 'tpp:0' });
    expect(out.paginationButtons[2]).toEqual({ text: '⠀', callback_data: 'tpp:0' });
  });

  it('first page of multi-page wraps Prev around to the last page', () => {
    const out = build({ materials: makeMaterials(17), page: 0, pageSize: 8 });
    expect(out.paginationButtons[0]).toEqual({ text: '⬅️ Prev', callback_data: 'tpp:2' });
    expect(out.paginationButtons[1]).toEqual({ text: 'Page 1/3', callback_data: 'tpp:0' });
    expect(out.paginationButtons[2]).toEqual({ text: 'Next ➡️', callback_data: 'tpp:1' });
  });

  it('middle page has both Prev and Next pointing to adjacent pages', () => {
    const out = build({ materials: makeMaterials(17), page: 1, pageSize: 8 });
    expect(out.paginationButtons[0].callback_data).toBe('tpp:0');
    expect(out.paginationButtons[1].callback_data).toBe('tpp:1');
    expect(out.paginationButtons[2].callback_data).toBe('tpp:2');
  });

  it('last page wraps Next around to page 0', () => {
    const out = build({ materials: makeMaterials(17), page: 2, pageSize: 8 });
    expect(out.paginationButtons[0]).toEqual({ text: '⬅️ Prev', callback_data: 'tpp:1' });
    expect(out.paginationButtons[2]).toEqual({ text: 'Next ➡️', callback_data: 'tpp:0' });
  });
});

describe('topicPickerBuilder.build — page clamp', () => {
  it('clamps page > totalPages-1 to the last page', () => {
    const out = build({ materials: makeMaterials(5), page: 99, pageSize: 8 });
    expect(out.totalPages).toBe(1);
    expect(out.page).toBe(0);
  });

  it('clamps negative page to 0', () => {
    const out = build({ materials: makeMaterials(17), page: -3, pageSize: 8 });
    expect(out.page).toBe(0);
  });

  it('clamps NaN page to 0', () => {
    const out = build({ materials: makeMaterials(3), page: NaN, pageSize: 8 });
    expect(out.page).toBe(0);
  });
});
