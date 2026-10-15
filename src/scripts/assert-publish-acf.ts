import assert from 'assert';
import {
  buildArticleAcfPayload,
  resolveFeaturedMediaId,
  PostData,
} from '../services/WordPressService';

const baseContent = { excerpt: 'Fallback excerpt from the document.', citations: [] as { text: string }[] };

// 1. No ACF input at all: still an explicit article_content_type (ACF's
//    own default_value only applies in the wp-admin edit form, not to
//    REST-created posts), plus the excerpt as the abstract fallback.
{
  const postData: PostData = { status: 'draft' };
  const acf = buildArticleAcfPayload(postData, baseContent);
  assert.deepStrictEqual(acf, {
    article_content_type: 'article',
    article_abstract: 'Fallback excerpt from the document.',
  });
}

// 2. Full ACF input: abstract override wins over excerpt, every optional
//    field present, FAQ rows with blank text dropped.
{
  const postData: PostData = {
    status: 'publish',
    acf: {
      abstract: '  Custom abstract.  ',
      contentType: 'video',
      youtubeUrl: 'https://www.youtube.com/watch?v=abc123',
      featuredArticle: true,
      faq: [
        { question: 'Q1?', answer: 'A1.' },
        { question: '   ', answer: 'dropped — blank question' },
        { question: 'dropped — blank answer', answer: '' },
      ],
    },
  };
  const acf = buildArticleAcfPayload(postData, {
    excerpt: 'Unused because abstract is set.',
    citations: [{ text: 'Darwin, C. (1859). On the Origin of Species.' }],
  });
  assert.deepStrictEqual(acf, {
    article_content_type: 'video',
    article_abstract: 'Custom abstract.',
    article_youtube_url: 'https://www.youtube.com/watch?v=abc123',
    article_references: '[1] Darwin, C. (1859). On the Origin of Species.',
    article_faq: [{ question: 'Q1?', answer: 'A1.' }],
    article_featured: true,
  });
}

// 3. No excerpt and no abstract at all: article_abstract must be omitted
//    entirely, never sent as an empty string.
{
  const postData: PostData = { status: 'draft' };
  const acf = buildArticleAcfPayload(postData, { excerpt: '   ', citations: [] });
  assert.strictEqual('article_abstract' in acf, false, 'blank abstract/excerpt must not send an empty ACF field');
}

// 4. Featured image resolution: featuredImageId matches an uploaded image.
{
  const postData: PostData = { status: 'draft', featuredImageId: 'image-2' };
  const uploaded = [
    { imageId: 'image-1', mediaId: 101 },
    { imageId: 'image-2', mediaId: 102 },
  ];
  assert.strictEqual(resolveFeaturedMediaId(postData, uploaded), 102);
}

// 5. featuredImageId set but not found among uploads (e.g. that image's
//    upload failed) — must not silently pick a wrong/random image.
{
  const postData: PostData = { status: 'draft', featuredImageId: 'image-missing' };
  const uploaded = [{ imageId: 'image-1', mediaId: 101 }];
  assert.strictEqual(resolveFeaturedMediaId(postData, uploaded), undefined);
}

// 6. No featuredImageId: falls back to a raw featuredImage WP media id.
{
  const postData: PostData = { status: 'draft', featuredImage: 555 };
  assert.strictEqual(resolveFeaturedMediaId(postData, []), 555);
}

// 7. Neither set: undefined, not a stray 0/null that WordPress could
//    misinterpret as "attach media id 0".
{
  const postData: PostData = { status: 'draft' };
  assert.strictEqual(resolveFeaturedMediaId(postData, []), undefined);
}

console.log('publish ACF / featured-media asserts passed');
