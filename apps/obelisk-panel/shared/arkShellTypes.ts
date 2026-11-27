import type {ReactAuthDataType} from "./arkAuthTypes";
export type UpdateDataType = {
    version: string;
    isImportant: boolean;
} | undefined;

export type ThemeType = {
    name: string;
    isDark: boolean;
    style: { [key: string]: string };
};


export type InjectedTxConsts = {
    arkCluster?: { backendAvailable?: boolean; maps: import("./arkTypes").ArkMap[] };
    //Env
    fxsVersion: string;
    fxsOutdated: UpdateDataType,
    txaVersion: string;
    txaOutdated: UpdateDataType,

    serverTimezone: string;
    isWindows: boolean;
    isWebInterface: boolean;
    showAdvanced: boolean;
    hasMasterAccount: boolean;
    defaultTheme: string;
    customThemes: Omit<ThemeType, 'style'>[];
    providerLogo: string | undefined;
    providerName: string | undefined;
    hostConfigSource: string;
    server: {
        name: string;
        game: string | undefined;
        icon: string | undefined;
    };

    //Auth
    preAuth: ReactAuthDataType | false;
}


//Maybe extract to some shared folder
export type PlayerIdsObjectType = {
    discord: string | null;
    fivem: string | null;
    license: string | null;
    license2: string | null;
    live: string | null;
    steam: string | null;
    xbl: string | null;
};

export type BanDurationType = "permanent" | {value: number; unit: "hours"|"days"|"weeks"|"months"};
