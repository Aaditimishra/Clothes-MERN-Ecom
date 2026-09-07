import type { FitFeedback } from '@shop/shared';

/**
 * Demo reviewers.
 *
 * Real customer documents rather than free-text names, because the review
 * endpoint derives the author name from the account and enforces one review per
 * customer per product. Faking the names would let the seed create data the API
 * itself would reject — and a seed that cannot round-trip through its own rules
 * is a seed that hides bugs.
 */
export const REVIEW_AUTHORS = [
  { firstName: 'Priya', lastName: 'Nair' },
  { firstName: 'Rahul', lastName: 'Menon' },
  { firstName: 'Ananya', lastName: 'Iyer' },
  { firstName: 'Kabir', lastName: 'Singh' },
  { firstName: 'Meera', lastName: 'Kulkarni' },
  { firstName: 'Arjun', lastName: 'Desai' },
  { firstName: 'Sneha', lastName: 'Rao' },
  { firstName: 'Vikram', lastName: 'Bose' },
  { firstName: 'Tara', lastName: 'Fernandes' },
  { firstName: 'Aditya', lastName: 'Joshi' },
  { firstName: 'Nisha', lastName: 'Verma' },
  { firstName: 'Rohan', lastName: 'Pillai' },
] as const;

interface ReviewTemplate {
  rating: number;
  title: string;
  body: string;
  fitFeedback: FitFeedback;
}

/**
 * Written to sound like reviews, not like filler.
 *
 * The mix is deliberate: mostly positive with a few threes and a two, because a
 * product page where every review is five stars reads as fake and teaches
 * nothing about the garment.
 */
export const REVIEW_TEMPLATES: ReviewTemplate[] = [
  {
    rating: 5,
    title: 'Exactly as pictured',
    body: 'The colour is true to the photographs and the fabric feels far more expensive than it cost. I have worn it three times in two weeks.',
    fitFeedback: 'true-to-size',
  },
  {
    rating: 5,
    title: 'Worth every rupee',
    body: 'Beautifully finished — the seams are clean inside and out. It held its shape after the first wash, which is more than I can say for most things at this price.',
    fitFeedback: 'true-to-size',
  },
  {
    rating: 4,
    title: 'Lovely, but size up',
    body: 'The quality is genuinely good and it drapes well. It does run a little snug across the shoulders though, so I would go one size up if you are between sizes.',
    fitFeedback: 'small',
  },
  {
    rating: 4,
    title: 'Great for the office',
    body: 'Smart enough for meetings without feeling stiff. Creases a bit through the day but that is the fabric doing what it should.',
    fitFeedback: 'true-to-size',
  },
  {
    rating: 5,
    title: 'My new favourite',
    body: 'I bought one and went back for a second colour within a fortnight. Comfortable straight out of the packet, no breaking in needed.',
    fitFeedback: 'true-to-size',
  },
  {
    rating: 3,
    title: 'Good, not great',
    body: 'No complaints about the make, but the cut is roomier than I expected from the photos. Fine once I sized down.',
    fitFeedback: 'large',
  },
  {
    rating: 4,
    title: 'Softer than expected',
    body: 'Arrived quickly and the fabric is lovely against the skin. Docking a star only because the colour is a touch deeper in person.',
    fitFeedback: 'true-to-size',
  },
  {
    rating: 5,
    title: 'Fit is spot on',
    body: 'The size guide was accurate to the centimetre, which almost never happens. Ordered my usual size and it fits perfectly.',
    fitFeedback: 'true-to-size',
  },
  {
    rating: 2,
    title: 'Ran very small on me',
    body: 'The material and finish are fine, but it was noticeably tighter than the measurements suggested. Exchanging for a larger size.',
    fitFeedback: 'small',
  },
  {
    rating: 4,
    title: 'Holds up well',
    body: 'Four washes in and no pilling or fading. It is becoming the thing I reach for on a weekday morning.',
    fitFeedback: 'true-to-size',
  },
  {
    rating: 5,
    title: 'Genuinely well made',
    body: 'You can feel the difference in the weight of the cloth. Sits properly at the shoulder, which is the bit most brands get wrong.',
    fitFeedback: 'true-to-size',
  },
  {
    rating: 3,
    title: 'Nice but a bit long',
    body: 'Happy with the quality overall. I am on the shorter side so it needed taking up, which is on me rather than the garment.',
    fitFeedback: 'large',
  },
];
