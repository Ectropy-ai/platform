import fs from 'fs';

const _convertFile = (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');

  // Convert require to import
  content = content.replace(
    /const (\w+) = require\(['"](.+)['"]\)/g,
    "import $1 from '$2'"
  );

  // Convert module.exports to export default
  content = content.replace(/module\.exports = /g, 'export default ');

  // Add .js to relative imports
  content = content.replace(
    /from ['"](\.[^'"]+)(?<!\.js)['"]/g,
    "from '$1.js'"
  );

  fs.writeFileSync(filePath, content);
  console.log(`✅ Converted: ${filePath}`);
};

// Run on specific files from your audit
// convertFile('./path/to/file.js');
