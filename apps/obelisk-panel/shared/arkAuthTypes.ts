import type {ApiAuthErrorResp} from "./genericApiTypes";
export type ReactAuthDataType = {
    arkPermissions?: string[];
    discordId?: string;
    role?: "owner"|"operator"|"viewer";
    name: string;
    permissions: string[];
    isMaster: boolean;
    isTempPassword: boolean;
    profilePicture?: string;
    csrfToken?: string;
}

export type ApiSelfResp = ApiAuthErrorResp | ReactAuthDataType;

export type ApiLogoutResp = {
    logout: true;
};
