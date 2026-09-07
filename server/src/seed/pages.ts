/**
 * The content pages the shop ships with.
 *
 * Real copy, not lorem ipsum: a page that says "Delivery information goes here"
 * teaches nobody whether the layout works, and a merchant reading it cannot tell
 * what they are supposed to replace.
 *
 * Everything here is editable in the admin after the first seed.
 */
export const SEED_PAGES = [
  {
    slug: 'delivery-and-returns',
    title: 'Delivery & returns',
    summary: 'How long it takes, what it costs, and how to send something back.',
    footerGroup: 'Help',
    position: 0,
    blocks: [
      {
        type: 'steps',
        heading: 'Delivery',
        items: [
          {
            title: 'Dispatched within 24 hours',
            detail:
              'Orders placed before 4pm on a working day leave the same day. Anything after that goes out the next morning.',
          },
          {
            title: 'Standard delivery — 3 to 5 working days',
            detail:
              'Free over ₹1,499, otherwise ₹99. Metro addresses are usually at the faster end of that range.',
          },
          {
            title: 'Cash on delivery',
            detail:
              'Available on orders under ₹10,000, with a ₹49 handling fee. Please keep the exact amount ready.',
          },
          {
            title: 'Tracking',
            detail:
              'You get a tracking number by email the moment your order ships, and it also appears under Your account → Orders.',
          },
        ],
      },
      {
        type: 'steps',
        heading: 'Returns',
        items: [
          {
            title: '15 days from delivery',
            detail:
              'Unworn, unwashed, with the tags still attached. Try things on over what you are already wearing.',
          },
          {
            title: 'Tell us first',
            detail:
              'Email us with your order reference. We will arrange a pickup from the address it was delivered to.',
          },
          {
            title: 'Refunds in 5 to 7 working days',
            detail:
              'Back to the original payment method once the garment reaches us and passes a quick check. Cash-on-delivery orders are refunded by bank transfer.',
          },
        ],
      },
      {
        type: 'callout',
        heading: 'What we cannot take back',
        body:
          'Anything worn, washed, altered or missing its tags. Innerwear and swimwear are not returnable for hygiene reasons.\n\nIf something arrived faulty or is not what you ordered, that is on us — write to us and we will sort it out regardless of the window.',
      },
    ],
  },
  {
    slug: 'size-and-fit',
    title: 'Size & fit',
    summary: 'How our sizes run, and how to pick the right one first time.',
    footerGroup: 'Help',
    position: 1,
    blocks: [
      {
        type: 'richText',
        body:
          'Most returns in clothing are about fit rather than taste, so we would rather you got it right the first time than had a smooth returns process.\n\nEvery product page has a size guide with the actual garment measurements in centimetres — not a generic S/M/L chart. Measure something you already own and like the fit of, and compare.',
      },
      {
        type: 'steps',
        heading: 'How to measure a garment you own',
        items: [
          {
            title: 'Chest or bust',
            detail:
              'Lay it flat, measure straight across from one underarm seam to the other, and double it.',
          },
          {
            title: 'Waist',
            detail: 'Measure across the narrowest point of the garment and double it.',
          },
          {
            title: 'Length',
            detail:
              'From the highest point of the shoulder straight down to the hem, keeping the tape flat.',
          },
        ],
      },
      {
        type: 'faq',
        heading: 'Common questions',
        items: [
          {
            title: 'I am between two sizes. Which should I take?',
            detail:
              'Size up for anything described as slim or bodycon, and size down for oversized or relaxed. The reviews on each product carry a fit note from people who actually bought it, and when enough of them agree we say so on the page.',
          },
          {
            title: 'Do your sizes match other Indian brands?',
            detail:
              'Roughly, but not exactly — nobody in the industry shares a standard. Trust the centimetres over the letter.',
          },
          {
            title: 'The size I want is sold out. Will it come back?',
            detail:
              'Usually yes for core pieces, rarely for seasonal ones. Sold-out sizes stay visible on the page rather than disappearing, so you can see the cut exists in your size at all.',
          },
        ],
      },
    ],
  },
  {
    slug: 'our-fabrics',
    title: 'Our fabrics',
    summary: 'What we use, why, and how to keep it looking right.',
    footerGroup: 'About',
    position: 0,
    blocks: [
      {
        type: 'richText',
        body:
          'We work almost entirely in natural fibres. They breathe better, they age better, and they can be repaired. The trade is that they need slightly more thought in the wash — which is a fair price for a garment that is still good in five years.',
      },
      {
        type: 'faq',
        heading: 'What each one does',
        items: [
          {
            title: 'Linen',
            detail:
              'The most breathable thing we sell, and the reason it works in an Indian summer. It creases — that is the fibre, not a fault. Wash cold, line dry, iron while damp if you want it crisp.',
          },
          {
            title: 'Cotton',
            detail:
              'Soft, sturdy, and it improves with washing. Our heavier cottons are pre-shrunk, so what you receive is the size it stays.',
          },
          {
            title: 'Merino wool',
            detail:
              'Fine enough to wear against the skin and warm without bulk. It resists odour, so it needs washing far less often than cotton. Hand wash or use a wool cycle, then dry flat.',
          },
          {
            title: 'Silk',
            detail:
              'Cool, fluid and stronger than it looks. Dry clean it — silk and hot water are a one-way conversation.',
          },
          {
            title: 'Viscose and modal',
            detail:
              'Plant-derived and beautifully drapey, which is why they turn up in our dresses. Wash cold on a gentle cycle; they are weakest when wet.',
          },
        ],
      },
      {
        type: 'callout',
        heading: 'A short washing rule',
        body:
          'Cold water, inside out, and less often than you think. Most clothes are worn out by washing machines rather than by wearing.',
      },
    ],
  },
  {
    slug: 'about',
    title: 'About Threadline',
    summary: 'Considered clothing in natural fibres, priced honestly.',
    footerGroup: 'About',
    position: 1,
    blocks: [
      {
        type: 'richText',
        body:
          'Threadline started from a small frustration: buying clothes online in India usually means guessing. Guessing the size, guessing what the fabric actually is, guessing whether the photo is the colour you will receive.\n\nSo we do a few things differently. Every product page carries real garment measurements. Every colourway is photographed as itself, not tinted from one shoot. Every review asks whether the garment ran small, and when enough people agree we put it on the page — before you buy, not after.',
      },
      {
        type: 'steps',
        heading: 'What we hold to',
        items: [
          {
            title: 'Natural fibres first',
            detail:
              'Linen, cotton, merino and silk. Blends where they genuinely perform better, not where they are simply cheaper.',
          },
          {
            title: 'Prices that include everything',
            detail:
              'The number on the page is the number you pay. GST is already in it, and delivery is free over ₹1,499.',
          },
          {
            title: 'Cuts that last more than a season',
            detail:
              'We would rather make a shirt you wear for five years than four you replace every winter.',
          },
        ],
      },
    ],
  },
  {
    slug: 'contact',
    title: 'Contact us',
    summary: 'A real person reads these.',
    footerGroup: 'Help',
    position: 2,
    blocks: [
      {
        type: 'contact',
        heading: 'Get in touch',
        body:
          'We answer within one working day. Please include your order reference if you have one — it is the six characters after TL- in your confirmation email.',
      },
      {
        type: 'faq',
        heading: 'Before you write',
        items: [
          {
            title: 'Where is my order?',
            detail:
              'Your account → Orders shows the current status and a tracking number once it ships.',
          },
          {
            title: 'I need to change my delivery address',
            detail:
              'Write to us straight away with the order reference. Once an order has shipped we cannot redirect it.',
          },
          {
            title: 'I want to exchange a size',
            detail:
              'Return the one you have and place a new order for the size you want — that way you are not waiting on stock that might sell out in the meantime.',
          },
        ],
      },
    ],
  },
] as const;
