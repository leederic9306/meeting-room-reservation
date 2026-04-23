import { Global, Module } from '@nestjs/common';

import { MailTemplateRenderer } from './mail-template.renderer';
import { MailService } from './mail.service';
import { SmtpMailService } from './smtp-mail.service';

@Global()
@Module({
  providers: [{ provide: MailService, useClass: SmtpMailService }, MailTemplateRenderer],
  exports: [MailService, MailTemplateRenderer],
})
export class MailModule {}
