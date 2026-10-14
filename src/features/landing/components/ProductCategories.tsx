import { resolveCategoryImage } from "@/constants/category-images";
import { ROUTES } from "@/constants/routes";
import { listActiveCategories } from "@/lib/supabase/queries";
import { CategoryTile } from "@/features/categories/components/CategoryTile";
import { Reveal } from "@/features/landing/components/Reveal";
import { CATEGORY_PLACEHOLDERS } from "@/features/landing/constants/landing.constants";

interface CategoryTileData {
  key: string;
  name: string;
  countLabel: string;
  imageUrl: string;
  href: string;
}

/**
 * Bento grid of shoppable categories. Fetches real categories (with active
 * product counts); if the taxonomy is not seeded yet, it falls back to
 * clearly-marked placeholder tiles so the section never renders empty.
 */
export async function ProductCategories() {
  let cards: CategoryTileData[];

  try {
    const categories = await listActiveCategories(4);
    cards =
      categories.length > 0
        ? categories.map((category, i) => ({
            key: category.id,
            name: category.name,
            countLabel: `${category.productCount.toLocaleString("en-US")} item${
              category.productCount === 1 ? "" : "s"
            }`,
            imageUrl: resolveCategoryImage(category, i),
            href: ROUTES.categoryDetail(category.slug),
          }))
        : CATEGORY_PLACEHOLDERS.map((placeholder) => ({
            key: placeholder.name,
            name: placeholder.name,
            countLabel: placeholder.countLabel,
            imageUrl: placeholder.imageUrl,
            href: ROUTES.products,
          }));
  } catch {
    cards = CATEGORY_PLACEHOLDERS.map((placeholder) => ({
      key: placeholder.name,
      name: placeholder.name,
      countLabel: placeholder.countLabel,
      imageUrl: placeholder.imageUrl,
      href: ROUTES.products,
    }));
  }

  return (
    <section className="bg-rj-black py-24">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal className="mb-12">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-rj-red">
            Browse by Category
          </p>
          <h2 className="font-serif text-4xl leading-[1.05] text-rj-white md:text-[52px]">
            Shop Every Style
          </h2>
        </Reveal>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {cards.map((card, i) => (
            <CategoryTile
              key={card.key}
              href={card.href}
              imageUrl={card.imageUrl}
              name={card.name}
              countLabel={card.countLabel}
              featured={i === 0}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
