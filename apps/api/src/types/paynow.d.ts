declare module "paynow" {
  export class Paynow {
    constructor(integrationId: string, integrationKey: string, resultUrl?: string, returnUrl?: string);
    resultUrl: string;
    returnUrl: string;
    createPayment(reference: string, authEmail?: string): {
      add(item: string, amount: number): void;
    };
    send(payment: { add: (item: string, amount: number) => void }): Promise<{
      success: boolean;
      pollUrl: string;
      redirectUrl?: string;
      instructions?: string;
      errors?: string;
      hasRedirect?: boolean;
      hash?: string;
      [key: string]: unknown;
    }>;
    sendMobile(
      payment: { add: (item: string, amount: number) => void },
      phone: string,
      method: "ecocash" | "onemoney"
    ): Promise<{
      success: boolean;
      pollUrl: string;
      instructions?: string;
      errors?: string;
      hash?: string;
      [key: string]: unknown;
    }>;
    pollTransaction(pollUrl: string): Promise<{
      paid?: boolean;
      status?: string;
      [key: string]: unknown;
    }>;
  }
}
