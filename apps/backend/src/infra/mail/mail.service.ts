export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * 메일 발송 어댑터 추상. 구현체(SMTP/SES 등)는 infra 레이어에 두고 서비스 레이어는
 * 본 추상 클래스에만 의존한다. 테스트에서는 jest.fn() 기반 mock provider로 교체한다.
 */
export abstract class MailService {
  abstract send(options: SendMailOptions): Promise<void>;
}
