import gis from 'g-i-s';

gis('hamburguesa doble queso', logResults);

function logResults(error, results) {
  if (error) {
    console.log(error);
  }
  else {
    console.log(JSON.stringify(results.slice(0, 3), null, 2));
  }
}
