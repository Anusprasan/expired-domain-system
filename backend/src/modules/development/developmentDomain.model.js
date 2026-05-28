import mongoose from "mongoose";

const developmentDomainSchema = new mongoose.Schema(
  {
    brandName: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    domain: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    landingPage: {
      type: String,
      required: true,
      trim: true,
    },
    termsAndConditionsPage: {
      type: String,
      default: null,
      trim: true,
    },
    aboutPage: {
      type: String,
      default: null,
      trim: true,
    },
    contactPage: {
      type: String,
      default: null,
      trim: true,
    },
    content: {
      title: {
        type: String,
        default: "",
        trim: true,
      },
      description: {
        type: String,
        default: "",
        trim: true,
      },
      article: {
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
      ref: "DevelopmentTemplate",
      default: null,
    },
    articlePoolArticleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ArticlePoolArticle",
    },
    assignedDeveloperId: {
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
    developmentStatus: {
      type: String,
      enum: ["new", "in-progress", "completed"],
      default: "new",
    },
    hostingStatus: {
      type: String,
      enum: ["not-hosted", "hosted"],
      default: "not-hosted",
    },
    gscStatus: {
      type: String,
      enum: ["not-done", "done"],
      default: "not-done",
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

developmentDomainSchema.index(
  { articlePoolArticleId: 1 },
  {
    unique: true,
    partialFilterExpression: { articlePoolArticleId: { $type: "objectId" } },
  }
);

const DevelopmentDomain = mongoose.model(
  "DevelopmentDomain",
  developmentDomainSchema
);

export default DevelopmentDomain;
