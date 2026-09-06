import {test,expect} from 'vitest';import {hasQuote} from './index.ts';
test('verbatim quotes use original string content, preserving quotes and newlines',()=>{const content={text:'The page says "route A".\nSecond line.'};expect(hasQuote(content,'"route A".\nSecond line.')).toBe(true);expect(hasQuote(content,'Route A')).toBe(false);expect(hasQuote(content,'says \\"route')).toBe(false);});
