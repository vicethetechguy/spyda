const res = await fetch('http://localhost:3000/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    recipe: { format: 'square', imageSize: '1024x1024' }
  })
});
const text = await res.text();
console.log('STATUS:', res.status);
console.log('BODY:', text);
