require("dotenv").config();

const app = require("./app");
const { startShortLinkScheduleRunner } = require("./modules/short-link-checker/shortLinkChecker.service");

const port = Number(process.env.PORT || 4020);

app.listen(port, () => {
  startShortLinkScheduleRunner();
  console.log(`Short Link Checker service running on port ${port}`);
});
