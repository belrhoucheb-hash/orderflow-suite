/**
 * Comprimeer een dataURL via canvas naar een JPEG-blob.
 * Schaalt naar maxDim (langste zijde) zodat foto's van moderne telefoons
 * niet onnodig 6-8 MB upload slurpen.
 */
export async function compressImage(
  dataUrl: string,
  maxDim = 1600,
  quality = 0.8,
): Promise<Blob> {
  const img = await loadImage(dataUrl);

  const longest = Math.max(img.width, img.height);
  const scale = longest > maxDim ? maxDim / longest : 1;
  const targetWidth = Math.round(img.width * scale);
  const targetHeight = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas-context niet beschikbaar voor compressie");
  }

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas.toBlob gaf geen resultaat"));
      },
      "image/jpeg",
      quality,
    );
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Kon afbeelding niet laden voor compressie"));
    img.src = dataUrl;
  });
}

/**
 * Comprimeer en geef een dataURL terug, zodat we lokaal (IndexedDB / preview)
 * dezelfde compacte versie kunnen tonen.
 */
export async function compressImageToDataUrl(
  dataUrl: string,
  maxDim = 1600,
  quality = 0.8,
): Promise<string> {
  const blob = await compressImage(dataUrl, maxDim, quality);
  return await blobToDataUrl(blob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("FileReader-fout"));
    reader.readAsDataURL(blob);
  });
}
