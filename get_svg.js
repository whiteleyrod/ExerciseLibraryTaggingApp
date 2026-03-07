const https = require('https');
const fs = require('fs');
https.get('https://upload.wikimedia.org/wikipedia/commons/e/e5/Muscles_anterior_labeled.svg', (res) => {
  const file = fs.createWriteStream('muscle_map_anterior.svg');
  res.pipe(file);
});
https.get('https://upload.wikimedia.org/wikipedia/commons/7/77/Muscles_posterior_labeled.svg', (res) => {
  const file = fs.createWriteStream('muscle_map_posterior.svg');
  res.pipe(file);
});
