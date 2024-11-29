import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { AuthRequest } from "@bitwarden/common/auth/models/request/auth.request";
import { AuthRequestResponse } from "@bitwarden/common/auth/models/response/auth-request.response";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";

import { AuthRequestApiService } from "../../abstractions/auth-request-api.service";

export class DefaultAuthRequestApiService implements AuthRequestApiService {
  constructor(
    private apiService: ApiService,
    private logService: LogService,
  ) {}

  async getAuthRequest(requestId: string): Promise<AuthRequestResponse> {
    try {
      const path = `/auth-requests/${requestId}`;
      const response = await this.apiService.send("GET", path, null, true, true);

      return response;
    } catch (e: unknown) {
      this.logService.error(e);
      throw e;
    }
  }

  async getAuthResponse(requestId: string, accessCode: string): Promise<AuthRequestResponse> {
    try {
      const path = `/auth-requests/${requestId}/response?code=${accessCode}`;
      const response = await this.apiService.send("GET", path, null, false, true);

      return response;
    } catch (e: unknown) {
      this.logService.error(e);
      throw e;
    }
  }

  async postAdminAuthRequest(request: AuthRequest): Promise<AuthRequestResponse> {
    try {
      const response = await this.apiService.send(
        "POST",
        "/auth-requests/admin-request",
        request,
        true,
        true,
      );

      return response;
    } catch (e: unknown) {
      this.logService.error(e);
      throw e;
    }
  }

  async postAuthRequest(request: AuthRequest): Promise<AuthRequestResponse> {
    try {
      const response = await this.apiService.send("POST", "/auth-requests/", request, false, true);

      return response;
    } catch (e: unknown) {
      this.logService.error(e);
      throw e;
    }
  }
}
