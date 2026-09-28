import axios from 'axios';
import { providerErrorMessage } from '../../common/http/provider-http.client.js';

export interface TicketingEnvelope {
  platform: string;
  payload: Record<string, unknown>;
  entity: Record<string, unknown>;
  osp_data: unknown;
  mitra_data: Record<string, unknown> | null;
}

export interface TicketingHttpClient {
  post<T = unknown>(url: string, body: unknown, config: Record<string, unknown>): Promise<{ status: number; data: T }>;
  get<T = unknown>(url: string, config: Record<string, unknown>): Promise<{ status: number; data: T }>;
}

export interface TicketingSearchQuery {
  platform: string;
  entityCode?: string;
  numberTicket?: string;
}

export class TicketingAdapter {
  constructor(
    private readonly client: TicketingHttpClient = axios,
    private readonly url = process.env.TICKETING_API_URL?.trim() ?? '',
    private readonly apiKey = process.env.TICKETING_API_KEY?.trim() ?? '',
    private readonly timeoutMs = Number(process.env.TICKETING_TIMEOUT_MS ?? 15000),
  ) {}

  async createTicket(envelope: TicketingEnvelope): Promise<{ httpStatus: number; data: unknown }> {
    try {
      const response = await this.client.post(this.url, envelope, {
        timeout: this.timeoutMs,
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
      });
      return { httpStatus: response.status, data: response.data };
    } catch (error) {
      const status = axios.isAxiosError(error) && error.response?.status ? ` HTTP ${error.response.status}` : '';
      throw new Error(`Ticketing provider gagal${status}: ${providerErrorMessage(error)}`);
    }
  }

  async searchTickets(query: TicketingSearchQuery): Promise<{ httpStatus: number; data: unknown }> {
    try {
      const response = await this.client.get(`${this.url.replace(/\/$/, '')}/search`, {
        params: query,
        timeout: this.timeoutMs,
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
      });
      return { httpStatus: response.status, data: response.data };
    } catch (error) {
      const status = axios.isAxiosError(error) && error.response?.status ? ` HTTP ${error.response.status}` : '';
      throw new Error(`Ticketing provider gagal${status}: ${providerErrorMessage(error)}`);
    }
  }
}
