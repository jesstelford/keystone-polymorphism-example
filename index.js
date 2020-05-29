const { Keystone } = require("@keystonejs/keystone");
const { GraphQLApp } = require("@keystonejs/app-graphql");
const { AdminUIApp } = require("@keystonejs/app-admin-ui");
const { MongooseAdapter: Adapter } = require("@keystonejs/adapter-mongoose");
const { LocalFileAdapter } = require("@keystonejs/file-adapters");
const { StaticApp } = require("@keystonejs/app-static");
const { File, Text, Relationship, Integer } = require("@keystonejs/fields");

const PROJECT_NAME = "test-polymorphism";
const adapterConfig = { mongoUri: "mongodb://localhost/test-polymorphism" };

/**
 * You've got a new KeystoneJS Project! Things you might want to do next:
 * - Add adapter config options (See: https://keystonejs.com/keystonejs/adapter-mongoose/)
 * - Select configure access control and authentication (See: https://keystonejs.com/api/access-control)
 */

const fileAdapter = new LocalFileAdapter({
  src: "./uploads",
  path: "/images"
});

const keystone = new Keystone({
  name: PROJECT_NAME,
  adapter: new Adapter(adapterConfig)
});

keystone.createList("ImageBlock", {
  fields: {
    image: { type: File, adapter: fileAdapter },
    post: { type: Relationship, ref: "Post.images" },
    order: { type: Integer }
  },
  labelResolver: item => `(${item.order}) ${item.image.originalFilename}`
});

keystone.createList("HeaderBlock", {
  fields: {
    header: { type: Text },
    post: { type: Relationship, ref: "Post.headers" },
    order: { type: Integer }
  },
  labelResolver: item => `(${item.order}) ${item.header}`
});

keystone.createList("ParagraphBlock", {
  fields: {
    paragraph: { type: Text },
    post: { type: Relationship, ref: "Post.paragraphs" },
    order: { type: Integer }
  },
  labelResolver: item => `(${item.order}) ${item.paragraph}`
});

keystone.createList("Post", {
  fields: {
    title: { type: Text },
    images: { type: Relationship, ref: "ImageBlock.post" },
    headers: { type: Relationship, ref: "HeaderBlock.post" },
    paragraphs: { type: Relationship, ref: "ParagraphBlock.post" }
  },
  labelField: "title"
});

keystone.extendGraphQLSchema({
  types: [
    { type: "type PostWithBlocks { id: ID, title: String, blocks: [Block] }" },
    { type: "union Block = ImageBlock | HeaderBlock | ParagraphBlock" }
  ],
  queries: [
    {
      schema: "getPost(id: ID!): PostWithBlocks",
      resolver: async (_, { id }, __, ___, { query }) => {
        // Fetch all the blocks in parallel
        // NOTE: The __typename field is important to fetch here and is what
        // allows us to return a Union type
        const [
          { data: { allImageBlocks } = {}, errors: imageErrors },
          { data: { allHeaderBlocks } = {}, errors: headerErrors },
          { data: { allParagraphBlocks } = {}, errors: paragraphErrors },
          { data: { Post } = {}, errors: postErrors }
        ] = await Promise.all([
          query(
            `
              query blocks($postId: ID!) {
                allImageBlocks(where: { post: { id: $postId } }) {
                  __typename
                  image {
                    publicUrl
                  }
                  order
                }
              }
            `,
            { variables: { postId: id } }
          ),
          query(
            `
              query blocks($postId: ID!) {
                allHeaderBlocks(where: { post: { id: $postId } }) {
                  __typename
                  header
                  order
                }
              }
            `,
            { variables: { postId: id } }
          ),
          query(
            `
              query blocks($postId: ID!) {
                allParagraphBlocks(where: { post: { id: $postId } }) {
                  __typename
                  paragraph
                  order
                }
              }
            `,
            { variables: { postId: id } }
          ),
          query(
            `
              query post($postId: ID!) {
                Post(where: { id: $postId }) {
                  title
                }
              }
            `,
            { variables: { postId: id } }
          )
        ]);

        if (imageErrors) throw imageErrors;
        if (headerErrors) throw headerErrors;
        if (paragraphErrors) throw paragraphErrors;
        if (postErrors) throw postErrors;

        const allBlocks = [
          ...allImageBlocks,
          ...allHeaderBlocks,
          ...allParagraphBlocks
        ].sort((left, right) => (left.order < right.order ? -1 : 1));

        return {
          id: id,
          title: Post.title,
          blocks: allBlocks
        };
      }
    }
  ]
});

module.exports = {
  keystone,
  apps: [
    new GraphQLApp(),
    new AdminUIApp({ enableDefaultRoute: true }),
    new StaticApp({
      path: "/images",
      src: "./uploads"
    })
  ]
};
