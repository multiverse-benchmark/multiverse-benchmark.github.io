/**
 * Paper metadata for the block at the top of the page.
 *
 * Source: the title, author list, affiliations, and author marks of the
 * paper's first page. The BibTeX entry is built from AUTHORS.
 */
import { PAPER } from './paper';

/** Placeholder page shown until the paper is public. Replace with the paper's URL on release. */
export const PAPER_URL = `${import.meta.env.BASE_URL}coming-soon.html`;
export const PAPER_IS_PUBLIC = true;
export const PAPER_YEAR = 2026;

/** The repository of the benchmark and the evaluation code. Its button is marked "coming soon" until CODE_IS_PUBLIC is set. */
export const CODE_URL = 'https://github.com/google-deepmind/MultiVerse';
export const CODE_IS_PUBLIC = true;

/** The dataset on the Hugging Face Hub. Its button is marked "coming soon" until DATA_IS_PUBLIC is set. */
export const DATA_URL = 'https://huggingface.co/datasets/google/MultiVerse';
export const DATA_IS_PUBLIC = true;

/**
 * Licenses of the release: the code under Apache 2.0, which includes the
 * simulated service APIs because they are software; the data under CC BY.
 */
export const LICENSES = [
  { what: 'Code and simulated service APIs', license: 'Apache 2.0' },
  { what: 'Data', license: 'CC BY' },
] as const;

/** What the placeholder page (coming-soon.html) says. The paper's button leads to it; "?item=codebase" and "?item=dataset" show the other two texts. */
export type ComingSoonItem = 'paper' | 'codebase' | 'dataset';
export const COMING_SOON: Record<ComingSoonItem, { name: string; title: string; text: string }> = {
  paper: {
    name: 'paper',
    title: PAPER.title,
    text: 'The paper is not public yet. This link will point to it as soon as it is released.',
  },
  codebase: {
    name: 'codebase',
    title: 'The benchmark and the evaluation code',
    text: 'We plan to release the benchmark and evaluation code, including the simulated service APIs, under the Apache 2.0 license. This link will point to the repository as soon as it is public.',
  },
  dataset: {
    name: 'dataset',
    title: 'The MultiVerse validation set',
    text: 'The dataset will be available on Hugging Face under the CC BY license. This link will point to it as soon as it is public.',
  },
};

export const AFFILIATIONS = ['Google DeepMind', 'Google', 'UCL', 'Tel Aviv University', 'MLCommons'] as const;

export type Author = {
  given: string;
  family: string;
  /** 1-based indices into AFFILIATIONS. */
  affiliations: number[];
  core?: boolean;
  lead?: boolean;
};

export const AUTHORS: Author[] = [
  { given: 'Sohee', family: 'Yang', affiliations: [1, 3], core: true, lead: true },
  { given: 'Selcuk', family: 'Gun', affiliations: [2], core: true },
  { given: 'Nora', family: 'Kassner', affiliations: [1], core: true },
  { given: 'Rafael', family: 'Mosquera-Gómez', affiliations: [5], core: true },
  { given: 'Minsuk', family: 'Chang', affiliations: [1] },
  { given: 'Yennie', family: 'Jun', affiliations: [1] },
  { given: 'Yuan', family: 'Shangguan', affiliations: [1] },
  { given: 'Julie', family: 'Liu', affiliations: [1] },
  { given: 'Idan', family: 'Heimlich Shtacher', affiliations: [1] },
  { given: 'Michele', family: 'Bevilacqua', affiliations: [1] },
  { given: 'Yang', family: 'Song', affiliations: [1] },
  { given: 'Abhijit', family: 'Rao', affiliations: [1] },
  { given: 'Sun Jae', family: 'Lee', affiliations: [1] },
  { given: 'Eric', family: 'Zhu', affiliations: [1] },
  { given: 'Chenmei', family: 'Li', affiliations: [1] },
  { given: 'Palak', family: 'Jain', affiliations: [1] },
  { given: 'Abhirut', family: 'Gupta', affiliations: [1] },
  { given: 'Jifan', family: 'Zhu', affiliations: [1] },
  { given: 'Shashi', family: 'Narayan', affiliations: [1] },
  { given: 'Stephan', family: 'Lee', affiliations: [1] },
  { given: 'Prateek', family: 'Kolhar', affiliations: [1] },
  { given: 'Anirudha', family: 'Rayasam', affiliations: [2] },
  { given: 'Xiaowei', family: 'Li', affiliations: [2] },
  { given: 'Kurt', family: 'Bollacker', affiliations: [5] },
  // MLCommons first, then Google, as the paper lists them.
  { given: 'Peter', family: 'Mattson', affiliations: [5, 2] },
  { given: 'Mor', family: 'Geva', affiliations: [4], core: true },
  { given: 'Max', family: 'Bartolo', affiliations: [1], core: true },
  { given: 'Sebastian', family: 'Riedel', affiliations: [1], core: true },
];

/** Non-ASCII letters written the way BibTeX expects. */
const bibtexEscape = (text: string) => text.replace(/ó/g, "{\\'o}");

/**
 * An author as "Given Family". A family name of more than one word is put in
 * braces, so that BibTeX reads all of it as the family name.
 */
const bibtexName = (author: Author) =>
  bibtexEscape(`${author.given} ${author.family.includes(' ') ? `{${author.family}}` : author.family}`);

export const BIBTEX = [
  '@article{yang2026multiverse,',
  `  title   = {{MultiVerse}: A Trustworthy Tool-Use Benchmark for Real-World Task Delegation under Harnesses},`,
  `  author  = {${AUTHORS.map(bibtexName).join(' and ')}},`,
  `  year    = {${PAPER_YEAR}},`,
  '  note    = {Preprint coming soon}',
  '}',
].join('\n');

export const PAPER_TITLE = PAPER.title;
