import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

export type RootStackParamList = {
    Home: undefined;
    MonthlyPayments: { year: number; month: number } | undefined;
    MemberMonth: { memberId: string; year: number; month: number };
    Members: undefined;
    AddMember: undefined;
    EditMember: { memberId: string };
    History: undefined;
    Reports: undefined;
    Export: undefined;
    Settings: undefined;
};

export type Nav = NativeStackNavigationProp<RootStackParamList>;
