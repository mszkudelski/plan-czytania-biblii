import { expect, it } from "vitest";
import { readingChapters, splitReadingChapters } from "./reading-parts";

it.each([
  ["Rdz 1-3", ["Rdz 1", "Rdz 2", "Rdz 3"]],
  [" Rdz 1 – 3 ", ["Rdz 1", "Rdz 2", "Rdz 3"]],
  ["Rdz 1—3", ["Rdz 1", "Rdz 2", "Rdz 3"]],
  ["Rdz 1−3", ["Rdz 1", "Rdz 2", "Rdz 3"]],
  ["1 Kor 2-3", ["1 Kor 2", "1 Kor 3"]],
  ["2Krn 1-2", ["2Krn 1", "2Krn 2"]],
  ["Pieśń nad Pieśniami 1-2", ["Pieśń nad Pieśniami 1", "Pieśń nad Pieśniami 2"]],
  ["Rdz1-2", ["Rdz 1", "Rdz 2"]],
  ["Rdz 1-2; 4; Mt 3-4", ["Rdz 1", "Rdz 2", "Rdz 4", "Mt 3", "Mt 4"]],
  ["Rdz 1-2, Wj 3", ["Rdz 1", "Rdz 2", "Wj 3"]],
  ["Rdz 1 | Mt 2 + Ps 3 · J 4", ["Rdz 1", "Mt 2", "Ps 3", "J 4"]],
  ["Rdz 1\nMt 2 / Ps 3", ["Rdz 1", "Mt 2", "Ps 3"]],
  ["Rdz 1-2; 3,1–10; J 3:16-18", ["Rdz 1", "Rdz 2", "Rdz 3,1–10", "J 3:16-18"]],
  ["J 3,16–18; 4,1–5", ["J 3,16–18", "J 4,1–5"]],
  ["Rdz 2; 2", ["Rdz 2", "Rdz 2"]],
])("splits references without losing order or repeated occurrences: %s", (label, expected) => {
  expect(splitReadingChapters(label as string)).toEqual(expected);
});

it.each([
  "J 3,16", "J 3,16–18", "J 3:16-18", "J 3,16a–18b", "J 3,16.18–20",
  "Rdz 1,20–2,3", "Rdz 1:20-3:5", "J 3,16,18", "Ps 119,1–176",
  "Rdz 3-1", "Rdz 0-3", "Rdz 1-999999999", "Rdz 1-2; nieznany fragment",
  "J 3,18-16", "J 3,0-5", "J 3,16-2,5", "Rdz 1;", "Refleksja na dziś", "",
])("preserves verse portions, ambiguous text and invalid ranges intact: %s", label => {
  expect(splitReadingChapters(label)).toEqual([label]);
});

it("preserves historical index mappings until a new plan opts in", () => {
  const segment = { id: "s0", section: "Biblia", label: "Rdz 1-3; J 3,16–18" };
  expect(readingChapters(segment)).toEqual([segment.label]);
  expect(readingChapters({ ...segment, referenceVersion: 1 })).toEqual(["Rdz 1", "Rdz 2", "Rdz 3", "J 3,16–18"]);
  expect(readingChapters({ ...segment, label: "Rdz 1-3" })).toEqual(["Rdz 1", "Rdz 2", "Rdz 3"]);
});
