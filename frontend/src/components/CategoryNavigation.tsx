import type { CategoryBranch } from '../services/categories';

export function CategoryNavigation({
  branches,
  category,
  subcategory,
  change,
  label,
}: {
  branches: CategoryBranch[];
  category: string;
  subcategory: string;
  change: (category: string, subcategory: string) => void;
  label: string;
}) {
  const branch = branches.find((b) => b.category.id === category);
  return (
    <div className="category-navigation">
      <nav className="category-tabs" aria-label={label}>
        <button
          className={!category ? 'active' : ''}
          aria-pressed={!category}
          onClick={() => change('', '')}
        >
          Todo
        </button>
        {branches.map(({ category: c }) => (
          <button
            key={c.id}
            className={category === c.id ? 'active' : ''}
            aria-pressed={category === c.id}
            onClick={() => change(c.id, '')}
          >
            {c.name}
          </button>
        ))}
      </nav>
      {branch && branch.children.length > 0 && (
        <nav
          className="category-tabs subcategory-tabs"
          aria-label={`Subcategorías de ${branch.category.name}`}
        >
          <button
            className={!subcategory ? 'active' : ''}
            aria-pressed={!subcategory}
            onClick={() => change(category, '')}
          >
            Todo en {branch.category.name}
          </button>
          {branch.children.map((c) => (
            <button
              key={c.id}
              className={subcategory === c.id ? 'active' : ''}
              aria-pressed={subcategory === c.id}
              onClick={() => change(category, c.id)}
            >
              {c.name}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
