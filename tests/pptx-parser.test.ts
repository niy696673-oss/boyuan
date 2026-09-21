import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { parsePptx } from '../server/research-platform/parsers/pptx-parser.js';
import { parseDocument } from '../server/research-platform/parsers/document-parser.js';

describe('PPTX and relaxed document parser', () => {
  it('parses PPTX slides and extracts paragraph blocks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pptx-test-'));
    const pptxPath = join(dir, 'presentation.pptx');
    try {
      const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p>
            <a:r><a:t>通约智能科技商业计划书</a:t></a:r>
          </a:p>
          <a:p>
            <a:r><a:t>致力于AI赋能投资研究</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

      const slide2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p>
            <a:r><a:t>核心团队介绍与融资需求：3000万元</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

      const zipData = zipSync({
        'ppt/slides/slide1.xml': strToU8(slide1Xml),
        'ppt/slides/slide2.xml': strToU8(slide2Xml),
      });
      writeFileSync(pptxPath, zipData);

      const parsed = await parsePptx(pptxPath);
      expect(parsed.format).toBe('pptx');
      expect(parsed.blocks).toHaveLength(3);
      expect(parsed.blocks[0]?.text).toBe('通约智能科技商业计划书');
      expect(parsed.blocks[0]?.page).toBe(1);
      expect(parsed.blocks[1]?.text).toBe('致力于AI赋能投资研究');
      expect(parsed.blocks[2]?.text).toBe('核心团队介绍与融资需求：3000万元');
      expect(parsed.blocks[2]?.page).toBe(2);

      // Verify parseDocument dispatches PPTX
      const docResult = await parseDocument({
        path: pptxPath,
        fileName: '路演材料.pptx',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      expect(docResult.format).toBe('pptx');
      expect(docResult.blocks).toHaveLength(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('handles arbitrary text and unknown files without crashing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'arbitrary-test-'));
    const txtPath = join(dir, 'notes.log');
    const binPath = join(dir, 'archive.dat');
    try {
      writeFileSync(txtPath, '系统运行日志：启动完成，服务就绪。', 'utf8');
      const txtParsed = await parseDocument({
        path: txtPath,
        fileName: 'notes.log',
      });
      expect(txtParsed.blocks[0]?.text).toContain('系统运行日志');

      // Binary with null bytes
      writeFileSync(binPath, Buffer.from([0x00, 0x01, 0x02, 0xff]));
      const binParsed = await parseDocument({
        path: binPath,
        fileName: 'archive.dat',
      });
      expect(binParsed.format).toBe('binary');
      expect(binParsed.blocks[0]?.text).toContain('已接收文件：archive.dat');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
