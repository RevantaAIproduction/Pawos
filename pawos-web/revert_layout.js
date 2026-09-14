const fs = require('fs');
let content = fs.readFileSync('src/app/page.tsx', 'utf8');

const newCodeChanges = 
      {/* 4. CODE CHANGES / BUILD ALONGSIDE YOU */}
      <section className="py-32 px-6">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-medium tracking-tight text-white">
              The best way to build with agents
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-16 items-start">
            <div className="pt-12">
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
                Built to drive real engineering work
              </h2>
              <p className="text-xl text-neutral-400 leading-relaxed">
                PawOS inspects your project, understands your request, and safely modifies your source code. From routine changes to your hardest problems, it reliably completes tasks end-to-end, applying the exact changes where they belong and reporting back what it achieved.
              </p>
            </div>
            <div className="rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl relative">
              <Image src="/pawos-companion-code-changes.png" alt="PawOS making code changes" width={1920} height={1080} className="w-full object-cover" />
            </div>
          </div>
        </div>
      </section>
;

// Replace the old CODE CHANGES section with the new layout
content = content.replace(/\{\/\* 4\. CODE CHANGES \*\/\}(.|\n)*?\{\/\* 5\. INSTALL SOFTWARE \*\/\}/m, newCodeChanges + '\n      {/* 5. INSTALL SOFTWARE */}');

fs.writeFileSync('src/app/page.tsx', content);