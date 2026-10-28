import type { Category } from '../types';

export interface CategoryBranch {
  category: Category;
  children: Category[];
  categoryIds: string[];
}

export function categoryIsActive(categories: Category[], id: string) {
  const category = categories.find((c) => c.id === id);
  if (!category || category.active === false) return false;
  return (
    !category.parent_id ||
    categories.some((p) => p.id === category.parent_id && !p.parent_id && p.active !== false)
  );
}

export function categoryTree(
  categories: Category[],
  productCategoryIds?: string[],
): CategoryBranch[] {
  return categories
    .filter((c) => !c.parent_id && c.active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((category) => {
      const children = categories
        .filter(
          (c) =>
            c.parent_id === category.id &&
            c.active !== false &&
            (!productCategoryIds || productCategoryIds.includes(c.id)),
        )
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      return { category, children, categoryIds: [category.id, ...children.map((c) => c.id)] };
    })
    .filter(
      (branch) =>
        !productCategoryIds || branch.categoryIds.some((id) => productCategoryIds.includes(id)),
    );
}

export function categoryPath(categories: Category[], id: string) {
  const category = categories.find((c) => c.id === id);
  const parent = categories.find((c) => c.id === category?.parent_id);
  return parent ? `${parent.name} › ${category!.name}` : category?.name || '';
}
