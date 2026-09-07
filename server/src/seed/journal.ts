/**
 * Journal entries the shop ships with.
 *
 * Written as real editorial rather than filler. A post that says "Blog content
 * here" tells you nothing about whether the layout holds a 600-word piece, and a
 * merchant cannot tell what they are meant to replace.
 *
 * `##` at the start of a line is a subheading; blank lines separate paragraphs.
 */
export const SEED_POSTS = [
  {
    slug: 'why-garment-dyed-cotton-fades-the-way-it-does',
    title: 'Why garment-dyed cotton fades the way it does',
    excerpt:
      'Dyed after it is sewn, not before. That one change in order is why the colour sits unevenly at the seams — and why it will keep moving for years.',
    category: 'Fabric',
    author: 'Meera Raghavan',
    readMinutes: 4,
    cover: '1602810318383-e386cc2a3ccf',
    coverAlt: 'A maroon garment-dyed cotton shirt, colour deepening at the seams',
    productSlugs: ['garment-dyed-cotton-shirt', 'heavyweight-cotton-tee'],
    body: `Every few weeks somebody writes to ask whether their shirt is faulty because the colour is darker along the shoulder seam than across the back. It is not faulty. That seam is the whole reason the shirt was made this way.

## What the process actually changes

Most cotton is dyed as yarn or as flat cloth, then cut and sewn. Garment dyeing reverses the order: the shirt is built first in undyed cotton, then dropped into the dye bath whole.

By then it is no longer a flat sheet. It has seams where four layers of cloth meet, thread in a slightly different fibre, and folds that the dye reaches last. Every one of those takes up colour at its own rate, and the shirt comes out with a depth that a flat-dyed cloth cannot fake.

It also comes out slightly smaller and softer, because the same bath does the shrinking and the relaxing that would otherwise happen in your first three washes.

## Why it keeps moving

Garment dye sits closer to the surface of the fibre than yarn dye does. That is what gives the colour its glow when it is new, and it is also why it lifts a little every wash — fastest in the first month, then very slowly for years.

The fade is not even, and it is not meant to be. It follows what you do: the elbows on the arm you lean on, the front of a shirt you wear open, the seat of a trouser.

## Working with it

Wash cold and inside out. Heat is what pulls surface dye off fastest.

Wash it separately the first two times. It will give up loose dye, and it will give it to whatever is in the drum with it.

Skip the optical brighteners. Ordinary detergent is fine; anything sold as brightening is designed to strip exactly the tone you bought.

Dry in shade. Direct sun on wet dyed cotton will bleach a panel in an afternoon, and that fade does not follow anything you did.

## When to stop worrying

Three years in, a garment-dyed shirt is a different colour than the one on the product page. Held next to a new one it looks washed out. Worn on its own it looks like something you own rather than something you bought — which is the only reason to pay for the process at all.`,
  },
  {
    slug: 'how-to-buy-a-size-you-have-never-tried-on',
    title: 'How to buy a size you have never tried on',
    excerpt:
      'Most online returns are about fit, not taste. Twenty minutes with a tape measure fixes almost all of them.',
    category: 'Fit',
    author: 'Aditi Sharma',
    readMinutes: 5,
    cover: '1483985988355-763728e1935b',
    coverAlt: 'A woman in a longline wool coat on a city street',
    productSlugs: ['wool-wrap-coat', 'oxford-button-down-shirt', 'tapered-selvedge-jean'],
    body: `Nobody in this industry shares a size standard. A medium from one brand is a small from another and a large from a third, and every one of them is telling the truth about their own pattern. This is why we publish garment measurements in centimetres on every product page rather than a chart of letters.

## Measure the garment, not yourself

This is the part most guides get backwards. Measuring your own chest tells you very little, because it says nothing about how much room the cut is supposed to add.

Instead, find something already in your wardrobe that fits the way you want the new thing to fit. Lay it flat. Measure across the chest from underarm seam to underarm seam and double it. Do the same at the waist. Measure the length from the highest point of the shoulder straight down.

Now compare those three numbers to ours.

## What the difference means

Within two centimetres, it will fit like the one you own.

Four to six centimetres larger is a relaxed version of the same thing — usually what you want in a shirt you will layer.

More than eight centimetres either way and you are looking at a different silhouette, not a different size.

## Where the fit notes come in

Every review on this shop asks whether the garment ran small, true to size, or large. One person saying "runs small" is a person who ordered wrong. Three or more agreeing is a pattern, and when that happens we put it on the product page before you buy — not in the reviews where you would find it afterwards.

## The one honest shortcut

If you are between sizes: size up for anything slim or bodycon, size down for anything oversized or relaxed. The cut is doing more work than the label.`,
  },
  {
    slug: 'five-pieces-that-carry-a-whole-week',
    title: 'Five pieces that carry a whole week',
    excerpt:
      'A small, deliberate set beats a full wardrobe of near-misses. This is the version we keep coming back to.',
    category: 'Lookbook',
    author: 'Kabir Singh',
    readMinutes: 3,
    cover: '1487222477894-8943e31ef7b2',
    coverAlt: 'A tan leather jacket worn open over a shirt',
    productSlugs: [
      'oxford-button-down-shirt',
      'tapered-selvedge-jean',
      'heavyweight-cotton-tee',
      'pleated-chino-trouser',
    ],
    body: `The useful test for a wardrobe is not how many outfits it contains but how many mornings it makes easy. Five pieces, chosen so that any top goes with any bottom, will out-perform twenty that only work in fixed pairs.

## The shirt that does two jobs

An oxford in white or sky reads formal enough for a meeting and casual enough open over a tee. Buy the one with a collar that stands up on its own — a soft collar under a jacket looks tired by lunchtime.

## One jean, worn in

Raw selvedge in a mid rise and a clean taper. It will fade to your shape rather than someone else's, and it is the only thing on this list that gets better specifically because you wore it badly.

## A tee heavy enough to hold shape

Anything under 200 gsm goes limp after a season. At 240 the collar still stands and the shoulders still sit where they were cut.

## Trousers that are not jeans

A pleated chino in stone or khaki. The pleat gives room through the thigh without looking full, which is the difference between comfortable and shapeless.

## Something with structure over the top

A jacket or an overshirt — whichever suits your climate. Its job is to make the four things underneath look deliberate.

## The rule underneath all of it

Every piece here works with every other piece. That is the entire trick, and it is worth more than any individual garment on the list.`,
  },
] as const;
