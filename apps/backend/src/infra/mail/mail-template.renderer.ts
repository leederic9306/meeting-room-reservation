import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import Handlebars from 'handlebars';

/**
 * src/infra/mail/templates/*.hbs 를 Handlebars로 렌더링하는 헬퍼.
 * 컴파일 결과는 프로세스 수명 동안 캐시한다.
 *
 * 빌드 시 .hbs 파일은 nest-cli.json의 assets 설정으로 dist/ 로 복사된다.
 * 경로는 __dirname 기준으로 해석하므로 ts-node(개발)와 node(배포) 모두에서 동작.
 */
@Injectable()
export class MailTemplateRenderer {
  private readonly logger = new Logger(MailTemplateRenderer.name);
  private readonly cache = new Map<string, HandlebarsTemplateDelegate>();
  private readonly templateDir = join(__dirname, 'templates');

  async render(name: string, vars: Record<string, unknown>): Promise<string> {
    const compiled = await this.load(name);
    return compiled(vars);
  }

  private async load(name: string): Promise<HandlebarsTemplateDelegate> {
    const cached = this.cache.get(name);
    if (cached) return cached;

    const filePath = join(this.templateDir, `${name}.hbs`);
    let source: string;
    try {
      source = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      this.logger.error(
        `템플릿 로드 실패: ${filePath}`,
        error instanceof Error ? error.stack : error,
      );
      throw new Error(`메일 템플릿을 찾을 수 없습니다: ${name}`);
    }

    const compiled = Handlebars.compile(source, { noEscape: false, strict: true });
    this.cache.set(name, compiled);
    return compiled;
  }
}
