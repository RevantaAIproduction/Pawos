const fs = require('fs');

function fixFile(filePath) {
    try {
        let buf = fs.readFileSync(filePath);
        if (buf[0] === 0xFF && buf[1] === 0xFE) {
            console.log(filePath + ' is UTF-16 LE. Fixing...');
            let text = buf.toString('utf16le');
            if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
            fs.writeFileSync(filePath, text, 'utf8');
        } else if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
            console.log(filePath + ' is UTF-8 with BOM. Fixing...');
            let text = buf.toString('utf8');
            if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
            fs.writeFileSync(filePath, text, 'utf8');
        } else {
            console.log(filePath + ' looks fine.');
        }
    } catch (e) {
        console.error('Error fixing ' + filePath + ':', e.message);
    }
}

fixFile('src/app/page.tsx');
fixFile('src/components/ParticleField.tsx');