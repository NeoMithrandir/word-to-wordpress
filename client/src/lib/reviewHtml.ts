import { ProcessedImage } from '../App';

const IMAGE_PLACEHOLDER = /src="data:[^"]+"/gi;

export function stripImageDataUris(
  html: string,
  images: Array<Pick<ProcessedImage, 'id' | 'data' | 'contentType'>>
): string {
  let next = html;
  for (const image of images) {
    if (!image.data || !image.contentType) continue;
    const uri = `src="data:${image.contentType};base64,${image.data}"`;
    next = next.split(uri).join(`src="[image:${image.id}]"`);
  }
  let index = 0;
  return next.replace(IMAGE_PLACEHOLDER, () => {
    const image = images[index];
    index += 1;
    return `src="[image:${image?.id || index}]"`;
  });
}

export function restoreImageDataUris(
  html: string,
  images: Array<Pick<ProcessedImage, 'id' | 'data' | 'contentType'>>
): string {
  let next = html;
  for (const image of images) {
    const token = `[image:${image.id}]`;
    if (!image.data) continue;
    next = next.split(`src="${token}"`).join(`src="data:${image.contentType};base64,${image.data}"`);
    next = next.split(token).join(`data:${image.contentType};base64,${image.data}`);
  }
  return next;
}

export function countWordsFromHtml(html: string): number {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.split(' ').length : 0;
}
