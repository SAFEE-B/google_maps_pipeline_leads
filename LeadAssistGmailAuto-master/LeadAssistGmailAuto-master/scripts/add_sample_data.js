const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database connection
const dbPath = path.join(__dirname, '..', 'data', 'leads.db');
const db = new sqlite3.Database(dbPath);

// Sample data generation
const sampleLeads = [
  // California leads
  {
    nameOfBusiness: "Golden State Fitness Center",
    typeOfBusiness: "gym",
    subCategory: "fitness center",
    website: "https://goldenstategym.com",
    phoneNumber: "(555) 123-4567",
    email: "info@goldenstategym.com",
    businessAddress: "1234 Fitness Ave, Los Angeles, CA 90210, United States",
    city: "Los Angeles",
    state: "CA",
    zipCode: "90210",
    rating: 4.5,
    numReviews: 127,
    latestReview: "2 weeks ago",
    sourceFile: "scraped_new_2024.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    nameOfBusiness: "Sunset Auto Repair",
    typeOfBusiness: "auto repair shop",
    subCategory: "car repair and maintenance service",
    website: "https://sunsetautorepair.com",
    phoneNumber: "(555) 234-5678",
    email: "service@sunsetautorepair.com",
    businessAddress: "5678 Repair Blvd, San Francisco, CA 94102, United States",
    city: "San Francisco",
    state: "CA",
    zipCode: "94102",
    rating: 4.2,
    numReviews: 89,
    latestReview: "1 week ago",
    sourceFile: "scraped_new_2024.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    nameOfBusiness: "Pacific Heights High School",
    typeOfBusiness: "high school",
    subCategory: "senior high school",
    website: "https://phhs.edu",
    phoneNumber: "(555) 345-6789",
    email: "admin@phhs.edu",
    businessAddress: "9876 Education Dr, San Diego, CA 92101, United States",
    city: "San Diego",
    state: "CA",
    zipCode: "92101",
    rating: 4.0,
    numReviews: 45,
    latestReview: "3 days ago",
    sourceFile: "default_schools.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    nameOfBusiness: "Oceanview RV Park",
    typeOfBusiness: "rv park",
    subCategory: "campground",
    website: "https://oceanviewrv.com",
    phoneNumber: "(555) 456-7890",
    email: "reservations@oceanviewrv.com",
    businessAddress: "2468 Ocean View Rd, Santa Barbara, CA 93101, United States",
    city: "Santa Barbara",
    state: "CA",
    zipCode: "93101",
    rating: 4.7,
    numReviews: 203,
    latestReview: "5 days ago",
    sourceFile: "scraped_new_2024.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    nameOfBusiness: "Bay Area Warehouse Solutions",
    typeOfBusiness: "warehouse",
    subCategory: "logistics service",
    website: "https://bayareawarehousing.com",
    phoneNumber: "(555) 567-8901",
    email: "operations@bayareawarehousing.com",
    businessAddress: "1357 Industrial Way, Oakland, CA 94607, United States",
    city: "Oakland",
    state: "CA",
    zipCode: "94607",
    rating: 3.9,
    numReviews: 67,
    latestReview: "1 month ago",
    sourceFile: "default_industrial.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // New York leads
  {
    nameOfBusiness: "Manhattan Muscle Gym",
    typeOfBusiness: "gym",
    subCategory: "gym",
    website: "https://manhattanmuscle.com",
    phoneNumber: "(212) 123-4567",
    email: "info@manhattanmuscle.com",
    businessAddress: "432 Fitness St, New York, NY 10001, United States",
    city: "New York",
    state: "NY",
    zipCode: "10001",
    rating: 4.8,
    numReviews: 312,
    latestReview: "1 day ago",
    sourceFile: "scraped_new_2024.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    nameOfBusiness: "Brooklyn Heights Laundromat",
    typeOfBusiness: "laundromat",
    subCategory: "laundry service",
    website: null,
    phoneNumber: "(718) 234-5678",
    email: null,
    businessAddress: "876 Clean Ave, Brooklyn, NY 11201, United States",
    city: "Brooklyn",
    state: "NY",
    zipCode: "11201",
    rating: 4.1,
    numReviews: 156,
    latestReview: "3 weeks ago",
    sourceFile: "scraped_new_2024.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    nameOfBusiness: "Gino's Famous Pizza",
    typeOfBusiness: "restaurant",
    subCategory: "pizza restaurant",
    website: "https://ginosfamouspizza.com",
    phoneNumber: "(212) 345-6789",
    email: "orders@ginosfamouspizza.com",
    businessAddress: "987 Delicious Blvd, New York, NY 10019, United States",
    city: "New York",
    state: "NY",
    zipCode: "10019",
    rating: 4.6,
    numReviews: 289,
    latestReview: "2 hours ago",
    sourceFile: "scraped_new_2024.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    nameOfBusiness: "Queens Middle School",
    typeOfBusiness: "middle school",
    subCategory: "middle school",
    website: "https://queensms.edu",
    phoneNumber: "(718) 456-7890",
    email: "principal@queensms.edu",
    businessAddress: "543 Education Pkwy, Queens, NY 11354, United States",
    city: "Queens",
    state: "NY",
    zipCode: "11354",
    rating: 3.8,
    numReviews: 72,
    latestReview: "1 week ago",
    sourceFile: "default_schools.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // Texas leads
  {
    nameOfBusiness: "Lone Star Fitness",
    typeOfBusiness: "gym",
    subCategory: "fitness center",
    website: "https://lonestarfitness.com",
    phoneNumber: "(713) 123-4567",
    email: "info@lonestarfitness.com",
    businessAddress: "789 Strength Rd, Houston, TX 77001, United States",
    city: "Houston",
    state: "TX",
    zipCode: "77001",
    rating: 4.3,
    numReviews: 198,
    latestReview: "4 days ago",
    sourceFile: "scraped_new_2024.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    nameOfBusiness: "Dallas Auto Works",
    typeOfBusiness: "auto repair shop",
    subCategory: "mechanic",
    website: "https://dallasautoworks.com",
    phoneNumber: "(214) 234-5678",
    email: "service@dallasautoworks.com",
    businessAddress: "321 Mechanic Way, Dallas, TX 75201, United States",
    city: "Dallas",
    state: "TX",
    zipCode: "75201",
    rating: 4.4,
    numReviews: 134,
    latestReview: "2 weeks ago",
    sourceFile: "scraped_new_2024.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    nameOfBusiness: "Austin Mobile Home Community",
    typeOfBusiness: "mobile home park",
    subCategory: "mobile home park",
    website: "https://austinmobilehomes.com",
    phoneNumber: "(512) 345-6789",
    email: "office@austinmobilehomes.com",
    businessAddress: "654 Community Dr, Austin, TX 73301, United States",
    city: "Austin",
    state: "TX",
    zipCode: "73301",
    rating: 3.7,
    numReviews: 89,
    latestReview: "1 month ago",
    sourceFile: "scraped_new_2024.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // Florida leads
  {
    nameOfBusiness: "Miami Beach Motel",
    typeOfBusiness: "motel",
    subCategory: "motel",
    website: "https://miamibeachmotel.com",
    phoneNumber: "(305) 123-4567",
    email: "reservations@miamibeachmotel.com",
    businessAddress: "123 Ocean Drive, Miami Beach, FL 33139, United States",
    city: "Miami Beach",
    state: "FL",
    zipCode: "33139",
    rating: 4.2,
    numReviews: 267,
    latestReview: "6 hours ago",
    sourceFile: "scraped_new_2024.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    nameOfBusiness: "Sunshine Nursing Home",
    typeOfBusiness: "nursing home",
    subCategory: "nursing home",
    website: "https://sunshinenursing.com",
    phoneNumber: "(407) 234-5678",
    email: "admissions@sunshinenursing.com",
    businessAddress: "456 Care Circle, Orlando, FL 32801, United States",
    city: "Orlando",
    state: "FL",
    zipCode: "32801",
    rating: 4.0,
    numReviews: 95,
    latestReview: "5 days ago",
    sourceFile: "default_healthcare.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    nameOfBusiness: "Tampa Bay High School",
    typeOfBusiness: "high school",
    subCategory: "high school",
    website: "https://tampabayhs.edu",
    phoneNumber: "(813) 345-6789",
    email: "office@tampabayhs.edu",
    businessAddress: "789 School Lane, Tampa, FL 33601, United States",
    city: "Tampa",
    state: "FL",
    zipCode: "33601",
    rating: 3.9,
    numReviews: 108,
    latestReview: "2 weeks ago",
    sourceFile: "default_schools.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // Washington State leads
  {
    nameOfBusiness: "Seattle Tech Manufacturing",
    typeOfBusiness: "factory",
    subCategory: "manufacturer",
    website: "https://seattletechmanuf.com",
    phoneNumber: "(206) 123-4567",
    email: "info@seattletechmanuf.com",
    businessAddress: "321 Industrial Blvd, Seattle, WA 98101, United States",
    city: "Seattle",
    state: "WA",
    zipCode: "98101",
    rating: 3.8,
    numReviews: 42,
    latestReview: "3 weeks ago",
    sourceFile: "default_industrial.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    nameOfBusiness: "Evergreen Apartments",
    typeOfBusiness: "apartment building",
    subCategory: "apartment complex",
    website: "https://evergreenapts.com",
    phoneNumber: "(253) 234-5678",
    email: "leasing@evergreenapts.com",
    businessAddress: "654 Residence Way, Tacoma, WA 98402, United States",
    city: "Tacoma",
    state: "WA",
    zipCode: "98402",
    rating: 4.1,
    numReviews: 173,
    latestReview: "1 week ago",
    sourceFile: "scraped_new_2024.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // Illinois leads
  {
    nameOfBusiness: "Chicago Fitness Club",
    typeOfBusiness: "gym",
    subCategory: "fitness center",
    website: "https://chicagofitnessclub.com",
    phoneNumber: "(312) 123-4567",
    email: "membership@chicagofitnessclub.com",
    businessAddress: "987 Workout Ave, Chicago, IL 60601, United States",
    city: "Chicago",
    state: "IL",
    zipCode: "60601",
    rating: 4.5,
    numReviews: 445,
    latestReview: "1 day ago",
    sourceFile: "scraped_new_2024.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    nameOfBusiness: "Windy City Warehouse Co",
    typeOfBusiness: "warehouse",
    subCategory: "warehouse",
    website: "https://windycitywarehouse.com",
    phoneNumber: "(773) 234-5678",
    email: "operations@windycitywarehouse.com",
    businessAddress: "432 Storage St, Chicago, IL 60609, United States",
    city: "Chicago",
    state: "IL",
    zipCode: "60609",
    rating: 3.6,
    numReviews: 78,
    latestReview: "2 months ago",
    sourceFile: "default_industrial.xlsx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// Function to insert sample data
function insertSampleData() {
  console.log('🚀 Starting to add sample lead data...');
  
  const stmt = db.prepare(`
    INSERT INTO leads (
      name_of_business, type_of_business, sub_category, website, phone_number, email,
      business_address, city, state, zip_code, rating, num_reviews, latest_review,
      source_file, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let insertedCount = 0;
  let errorCount = 0;

  sampleLeads.forEach((lead, index) => {
    stmt.run(
      lead.nameOfBusiness,
      lead.typeOfBusiness,
      lead.subCategory,
      lead.website,
      lead.phoneNumber,
      lead.email,
      lead.businessAddress,
      lead.city,
      lead.state,
      lead.zipCode,
      lead.rating,
      lead.numReviews,
      lead.latestReview,
      lead.sourceFile,
      lead.createdAt,
      lead.updatedAt,
      function(err) {
        if (err) {
          console.error(`❌ Error inserting lead ${index + 1}:`, err.message);
          errorCount++;
        } else {
          insertedCount++;
          console.log(`✅ Inserted: ${lead.nameOfBusiness} (${lead.typeOfBusiness} in ${lead.city}, ${lead.state})`);
        }
        
        // Check if all leads have been processed
        if (insertedCount + errorCount === sampleLeads.length) {
          console.log(`\n🎉 Sample data insertion complete!`);
          console.log(`✅ Successfully inserted: ${insertedCount} leads`);
          console.log(`❌ Errors: ${errorCount} leads`);
          
          // Show summary by business type and state
          showDataSummary();
        }
      }
    );
  });

  stmt.finalize();
}

// Function to show data summary
function showDataSummary() {
  console.log('\n📊 DATA SUMMARY:');
  
  // Summary by business type
  db.all(
    'SELECT type_of_business, COUNT(*) as count FROM leads GROUP BY type_of_business ORDER BY count DESC',
    (err, rows) => {
      if (!err) {
        console.log('\n🏢 By Business Type:');
        rows.forEach(row => {
          console.log(`   ${row.type_of_business}: ${row.count} leads`);
        });
      }
    }
  );

  // Summary by state
  db.all(
    'SELECT state, COUNT(*) as count FROM leads GROUP BY state ORDER BY count DESC',
    (err, rows) => {
      if (!err) {
        console.log('\n🌍 By State:');
        rows.forEach(row => {
          console.log(`   ${row.state}: ${row.count} leads`);
        });
      }
    }
  );

  // High-rated leads summary
  db.all(
    'SELECT COUNT(*) as count FROM leads WHERE rating >= 4.0',
    (err, rows) => {
      if (!err) {
        console.log(`\n⭐ High-rated leads (4.0+): ${rows[0].count}`);
      }
    }
  );

  // Close database connection
  setTimeout(() => {
    db.close((err) => {
      if (err) {
        console.error('❌ Error closing database:', err.message);
      } else {
        console.log('\n✅ Database connection closed successfully');
        console.log('\n🎯 Sample data is now ready for testing lead filtering!');
      }
    });
  }, 1000);
}

// Run the insertion
insertSampleData(); 