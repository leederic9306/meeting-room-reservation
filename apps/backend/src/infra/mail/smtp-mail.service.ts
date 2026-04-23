import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import type { Env } from '../../config/env.validation';

import { MailService, type SendMailOptions } from './mail.service';

/**
 * nodemailer 기반 SMTP 구현. 로컬은 MailHog(localhost:1025), 운영은 SES/SMTP로 교체.
 * 환경변수: MAIL_HOST / MAIL_PORT / MAIL_USER / MAIL_PASSWORD / MAIL_FROM / MAIL_FROM_NAME
 */
@Injectable()
export class SmtpMailService extends MailService implements OnModuleDestroy {
  private readonly logger = new Logger(SmtpMailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    const host = config.get('MAIL_HOST', { infer: true });
    const port = config.get('MAIL_PORT', { infer: true });
    const user = config.get('MAIL_USER', { infer: true });
    const password = config.get('MAIL_PASSWORD', { infer: true });

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass: password } : undefined,
    });
    const fromEmail = config.get('MAIL_FROM', { infer: true });
    const fromName = config.get('MAIL_FROM_NAME', { infer: true });
    this.from = `"${fromName}" <${fromEmail}>`;
  }

  async send(options: SendMailOptions): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    this.logger.debug(`메일 발송 완료: to=${options.to} subject=${options.subject}`);
  }

  onModuleDestroy(): void {
    this.transporter.close();
  }
}
