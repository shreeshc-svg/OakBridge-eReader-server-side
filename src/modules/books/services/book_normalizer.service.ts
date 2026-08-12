import mammoth from 'mammoth';

export interface NormalizedChapter {
     id: string;
     title: string;
     htmlContent: string;
}

export interface BookPackage {
     version: '1.0';
     title: string;
     author: string;
     format: 'book';
     chapters: NormalizedChapter[];
}

function sanitizeXmlText(str: string): string {
     if (!str) return '';
     return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export const book_normalizer_service = {
     /**
      * Converts a DOCX file buffer into a normalized BookPackage XHTML structure
      */
     async normalizeDocx(buffer: Buffer, title: string, author: string): Promise<BookPackage> {
          const result = await mammoth.convertToHtml({
               buffer,
          }, {
               convertImage: mammoth.images.imgElement(function(image: any) {
                    return image.read('base64').then(function(imageBuffer: string) {
                         return { src: `data:${image.contentType};base64,${imageBuffer}` };
                    });
               }),
          });
          const rawHtml = sanitizeXmlText(result.value);

          // Split by h1 / h2 headings into chapters if present, or group into a single chapter
          const chapterSections = rawHtml.split(/<h[12]>/i);
          const chapters: NormalizedChapter[] = [];

          if (chapterSections.length > 1) {
               for (let i = 0; i < chapterSections.length; i++) {
                    const section = chapterSections[i].trim();
                    if (!section) continue;

                    let chapterTitle = `Chapter ${i}`;
                    let content = section;

                    // Extract heading title if section started with heading text
                    const closingIdx = section.indexOf('</h');
                    if (closingIdx !== -1) {
                         chapterTitle = section.substring(0, closingIdx).replace(/<[^>]+>/g, '').trim();
                         content = section.substring(closingIdx + 5);
                    }

                    chapters.push({
                         id: `chap-${i + 1}`,
                         title: chapterTitle || `Chapter ${i + 1}`,
                         htmlContent: `<h2 class="kdp-heading">${chapterTitle}</h2><div class="kdp-chapter-content">${content}</div>`,
                    });
               }
          } else {
               chapters.push({
                    id: 'chap-1',
                    title: title || 'Chapter 1',
                    htmlContent: `<h2 class="kdp-heading">${title || 'Chapter 1'}</h2><div class="kdp-chapter-content">${rawHtml}</div>`,
               });
          }

          return {
               version: '1.0',
               title,
               author,
               format: 'book',
               chapters,
          };
     },
};
