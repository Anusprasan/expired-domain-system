import mongoose from "mongoose";

const articlePoolArticleSchema = new mongoose.Schema(
  {
    brandName: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    topic: {
      type: String,
      required: true,
      trim: true,
    },
    targetKeyword: {
      type: String,
      default: "",
      trim: true,
    },
    targetUrl: {
      type: String,
      default: "",
      trim: true,
    },
    articleUrl: {
      type: String,
      default: "",
      trim: true,
    },
    content: {
      title: {
        type: String,
        default: "",
        trim: true,
      },
      summary: {
        type: String,
        default: "",
        trim: true,
      },
      body: {
        type: String,
        default: "",
        trim: true,
      },
      note: {
        type: String,
        default: "",
        trim: true,
      },
    },
    resources: {
      referenceLinks: {
        type: [String],
        default: [],
      },
      imageLinks: {
        type: [String],
        default: [],
      },
      logos: {
        type: [String],
        default: [],
      },
      gifs: {
        type: [String],
        default: [],
      },
      heroImage: {
        type: String,
        default: "",
        trim: true,
      },
      favicon: {
        type: String,
        default: "",
        trim: true,
      },
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ArticlePoolTemplate",
      default: null,
    },
    assignedWriterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedAt: {
      type: Date,
      default: null,
    },
    contentEditorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    contentEditingAt: {
      type: Date,
      default: null,
    },
    contentUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    contentUpdatedAt: {
      type: Date,
      default: null,
    },
    progressPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    writingStatus: {
      type: String,
      enum: ["new", "writing", "ready"],
      default: "new",
    },
    reviewStatus: {
      type: String,
      enum: ["not-reviewed", "needs-revision", "approved"],
      default: "not-reviewed",
    },
    publicationStatus: {
      type: String,
      enum: ["not-published", "published"],
      default: "not-published",
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

articlePoolArticleSchema.index({ brandName: 1, topic: 1 });
articlePoolArticleSchema.index({ assignedWriterId: 1, assignedAt: -1 });

const ArticlePoolArticle = mongoose.model(
  "ArticlePoolArticle",
  articlePoolArticleSchema
);

export default ArticlePoolArticle;
