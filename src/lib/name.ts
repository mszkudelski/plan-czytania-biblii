export function cleanPersonName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function normalizePersonName(name: string) {
  return cleanPersonName(name).toLocaleLowerCase("pl-PL");
}
