const dotenv = require('dotenv');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Brand = require('../src/models/Brand');
const Domain = require('../src/models/Domain');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const importData = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('Missing MONGO_URI in server/.env');
  }

  await mongoose.connect(process.env.MONGO_URI);

  // Import brands
  const brandsPath = 'd:\\.Port City\\Domain Dashboard\\test.brands.json';
  if (fs.existsSync(brandsPath)) {
    const brandsData = JSON.parse(fs.readFileSync(brandsPath, 'utf8'));
    console.log(`Importing ${brandsData.length} brands...`);

    // Clear existing brands
    await Brand.deleteMany({});
    await Brand.insertMany(brandsData);
    console.log('Brands imported successfully');
  } else {
    console.log('Brands file not found');
  }

  // Import domains
  const domainsPath = 'd:\\.Port City\\Domain Dashboard\\test.domains.json';
  if (fs.existsSync(domainsPath)) {
    const domainsData = JSON.parse(fs.readFileSync(domainsPath, 'utf8'));
    console.log(`Importing ${domainsData.length} domains...`);

    // Clear existing domains
    await Domain.deleteMany({});

    let imported = 0;
    for (const domain of domainsData) {
      try {
        await Domain.create(domain);
        imported++;
      } catch (error) {
        console.error(`Error importing domain ${domain.domain}:`, error.message);
      }
    }
    console.log(`Domains imported: ${imported}/${domainsData.length}`);
  } else {
    console.log('Domains file not found');
  }

  await mongoose.disconnect();
  console.log('Import completed');
};

importData().catch(console.error);
