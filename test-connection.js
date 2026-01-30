const mysql = require("mysql2");

console.log("🔍 Testing MySQL Connection...");

const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Vishva5061!",
  port: 3306
});

connection.connect((err) => {
  if (err) {
    console.error("❌ Connection error:", err.message);
    console.error("Error code:", err.code);
  } else {
    console.log("✅ Connected to MySQL!");
    connection.query("SHOW DATABASES", (err, results) => {
      if (err) throw err;
      console.log("📊 Databases found:", results.length);
      results.forEach(db => {
        console.log(`   - ${db.Database}`);
      });
      connection.end();
      process.exit(0);
    });
  }
});
