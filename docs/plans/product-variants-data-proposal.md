# Product options (size / color) - data proposal (dry run)

Status: **Groups A and B applied 2026-10-22** (586 units before and after; Group C untouched). Read-only review of all 149 products (Bottoms 102, Shirts & Tops 18, Decors 17, Outerwear 12) against the title, description, tags and material of each.

## Rules

1. A color is proposed only when the **title says it**. A size is never proposed - no product's title, description or tags states one.
2. Stock is only **moved**, never created or copied (`allocate_stock_to_variants`: total preserved, atomic). No option quantity is typed in by us.
3. Products with orders are **not merged or renamed** (58 products have orders; their order lines point at the product).
4. Adding the first option to a product makes its own stock row "unassigned" (not sold) until moved. So for Group B the whole product stock moves into the one color option in the same step - otherwise the product would show as sold out.
5. Anything not confirmable is flagged and left for the seller.

## Group A - the two products with mixed options (fix, do not recreate)

| Product | Today | Proposed |
|---|---|---|
| men's textured semi formal wear (`2303aa4c-...`, Bottoms) | base stock 13; options: **Blue** (color only, 12) and sizes 28/30/32/34 (0 each), 36/38/40 (12 each) | Set `color = Blue` on the seven size rows in place (keeps their ids, stock and order references), so they become Blue x size. The color-only Blue row is retired (inactive). Sizes 28-34 stay at 0. |
| Slim fit chino shorts (`a2645970-...`, Shirts & Tops) | base stock 13; options: **Blue** (color only, 12) and XS/S/M/L/XL/XXL (12 each) | Same: `color = Blue` on the six size rows; retire the color-only Blue row. |

Needs your decision (cannot be settled from the data): each product has **12 units on the color-only Blue row and 13 on the base row** that are not in any size. Today the page sells only the size rows. Proposal: leave those units where they are, flagged **"unassigned"** in Inventory, and let the seller count them into sizes with "Move to options". Nothing is lost and nothing is double-counted. Check before applying that no cart or order line references the retired Blue row.

## Group B - single color confirmed by the title (34 products, 29 single + 5 two-color)

Create one color option and move the product's **entire** current stock into it. Quantity after = quantity before.

| Product (id prefix) | Color | Stock moved |
|---|---|---|
| Bubble latice shorts-blue `08c36523` | Blue | 22 |
| Bubble latice shorts-brown `6f7bbc6b` | Brown | 10 |
| Bubble latice shorts-light blue `6dba35d2` | Light Blue | 23 |
| Bubble latice shorts-orange `30c32884` | Orange | 13 |
| Bubble latice shorts-pink `fe90b000` | Pink | 13 |
| Bubble latice shorts-red `4a17f975` | Red | 17 |
| Bubble latice shorts-white `e75ed156` | White | 14 |
| cali shorts black `a92b055b` | Black | 20 |
| cali shorts grey `45bfd008` | Grey | 15 |
| cali shorts pink `0ec55815` | Pink | 15 |
| cali shorts red `717aa1b1` | Red | 16 |
| Diamond jersey shorts-golden state blue `2851a554` | Blue | 10 |
| Diamond jersey shorts-red lakers `1893c3d1` | Red | 15 |
| Diamond jersey shorts-yellow spurs `e7958f44` | Yellow | 15 |
| Drifit jersey shorts-bulls blue `6cd3c062` | Blue | 21 |
| Drifit jersey shorts-new york red `7efc7803` | Red | 10 |
| Drifit jersey shorts-warriors blue `bd93f2ea` | Blue | 18 |
| Drifit NBA shorts-bucks yellow `fd1ad1f8` | Yellow | 10 |
| Plain short Black `07cf2f23` | Black | 28 |
| Plain short blue `f213d947` | Blue | 48 |
| Plain short green `2773cc05` | Green | 20 |
| Plain short grey `dda0e5f8` | Grey | 12 |
| Taslan running shorts bart print-black `ba089601` | Black | 29 |
| Taslan running shorts bart print-blue `9bb63325` | Blue | 15 |
| Taslan running shorts bart print-maroon `9ba49c63` | Maroon | 20 |
| Taslan running shorts bart print-pink `ee1a9e01` | Pink | 13 |
| Taslan running shorts bart print-yellow `51237614` | Yellow | 10 |
| Terry cotton stripes black `de37063e` | Black | 14 |
| Terry cotton stripes black `e6caa3b1` | Black | 21 |
| **Two-color (confirm the label):** Plain short black-grey `259609a5` | Black / Grey | 13 |
| Plain short yellow-white `8e1359a6` | Yellow / White | 21 |
| Terry cotton stripes black/green `cb8bfe22` | Black / Green | 12 |
| Terry cotton stripes black/orange `d6312602` | Black / Orange | 13 |
| Terry cotton stripes gray and white `7a0e508f` | Gray / White | 20 |

Before applying, check each product for **cart items without an option** (they would stop being addable) and for `draft` / `sold` / `archived` status (a status change from the move is not wanted).

## Group C - flagged, no change (needs the seller)

- **Team-name titles with no color word**: Diamond jersey shorts-celtics, Drifit jersey shorts-celtics, Drifit NBA shorts-bucks / -bulls / -celtics / -Lakers, NBA combi jersey shorts (bulls, clippers, lakers). A team does not confirm a color.
- **No color or size anywhere in the title or description**: the repeated "Chalis shorts", "Ruffles short chalis", "Skater Mini Skirts for women", "Taslan dragon Running shorts", the "men's ... semi formal / textured / jacquard" family, Terry cotton short(s), Cargo / Denim / trousers / skirts, and the Shirts & Tops and Outerwear lines.
- **Sizes for every product** (all 149): unconfirmed. Bottoms' category list is 28-40, Shirts & Tops and Outerwear use XS-XXL.
- **Decors (17)**: no size or color; material and dimensions are the relevant options if the seller wants variants (e.g. the Tote Bag). No change proposed.
- Data oddities noticed, not touched: "Slim fit chino shorts" is filed under Shirts & Tops; `b12af2c9...` "men's semi formal wear fit" has a jacket description; "Vintage Jacket Demin" is in Shirts & Tops with a placeholder description; "Test Seller Tote Bag" is a test product.

## Rollback

Snapshot `product_variants`, `inventory` and `stock_adjustments` for the affected products before applying. Every stock move is logged in `stock_adjustments` (reason `correction`), so each can be reversed with an equal and opposite move.
