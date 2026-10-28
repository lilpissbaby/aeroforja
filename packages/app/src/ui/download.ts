/** Hands the viewer a file to save. */
export function download(filename: string, data: string | ArrayBuffer, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Some browsers start the download after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A project name as a safe file name: no accents, spaces or symbols. */
export const fileSafe = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "modelo";
