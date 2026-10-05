import React, { useEffect, useState } from "react";

import {
    Alert,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import {
    deleteMember,
    getMembers,
    setMemberActive,
    type Member,
} from "../database/memberStorage";

import { deletePaymentsForMember } from "../database/paymentStorage";

import {
    deleteMonthlyObligationsForMember,
} from "../database/monthlyObligationStorage";

import { useNavigation } from "@react-navigation/native";

import type {
    NativeStackNavigationProp,
} from "@react-navigation/native-stack";

import { useLanguage } from "../localization/LanguageContext";

type RootStackParamList = {
    Home: undefined;

    Members: undefined;

    AddMember: undefined;

    EditMember: {
        memberId: string;
    };
};

type MembersScreenNavigationProp =
    NativeStackNavigationProp<
        RootStackParamList,
        "Members"
    >;

export default function MembersScreen() {
    const navigation =
        useNavigation<MembersScreenNavigationProp>();

    const { language, t } = useLanguage();

    const [members, setMembers] =
        useState<Member[]>([]);

    const [showInactive, setShowInactive] =
        useState(false);

    const loadMembers = async () => {
        try {
            const data = await getMembers();

            setMembers(data);
        } catch (error) {
            console.error(
                "Load members error:",
                error
            );
        }
    };

    useEffect(() => {
        loadMembers();
    }, []);

    const visibleMembers =
        members.filter((member) =>
            showInactive
                ? !member.isActive
                : member.isActive
        );

    const text =
        language === "Gujarati"
            ? {
                markInactive: "નિષ્ક્રિય કરો",
                reactivateMember:
                    "સભ્યને ફરી સક્રિય કરો",
                willBeInactive:
                    "નિષ્ક્રિય કરવામાં આવશે.",
                willBeReactivated:
                    "ફરી સક્રિય કરવામાં આવશે.",
                reactivate: "ફરી સક્રિય કરો",
                updateStatusError:
                    "સભ્યની સ્થિતિ અપડેટ કરી શકાઈ નથી.",
                deleteMember:
                    "સભ્યને કાયમી રીતે કાઢી નાખવો છે?",
                deleteWarning:
                    "આ સભ્ય અને તેના તમામ સંબંધિત ચુકવણી અને માસિક બાકી રેકોર્ડ કાયમી રીતે કાઢી નાખવામાં આવશે.\n\nઆ કાર્યવાહી પૂર્વવત્ કરી શકાશે નહીં.",
                deletePermanently:
                    "કાયમી રીતે કાઢી નાખો",
                memberDeleted:
                    "સભ્ય કાઢી નાખ્યો",
                memberDeletedMessage:
                    "કાયમી રીતે કાઢી નાખવામાં આવ્યો છે.",
                deleteError:
                    "સભ્યને કાઢી શક્યા નથી. કૃપા કરીને ફરી પ્રયાસ કરો.",
                month: "/ મહિનો",
                inactiveMembers:
                    "નિષ્ક્રિય સભ્યો",
                activeMembers:
                    "સક્રિય સભ્યો",
                add: "+ ઉમેરો",
                active: "સક્રિય",
                inactive: "નિષ્ક્રિય",
                noInactiveMembers:
                    "કોઈ નિષ્ક્રિય સભ્યો નથી",
                noMembers:
                    "હજુ સુધી કોઈ સભ્ય નથી",
                inactiveWillAppear:
                    "નિષ્ક્રિય સભ્યો અહીં દેખાશે.",
                addFirstMember:
                    "શરૂ કરવા માટે તમારો પહેલો સભ્ય ઉમેરો.",
            }
            : {
                markInactive: "Mark Inactive",
                reactivateMember:
                    "Reactivate Member",
                willBeInactive:
                    "will be marked inactive.",
                willBeReactivated:
                    "will be reactivated.",
                reactivate: "Reactivate",
                updateStatusError:
                    "Unable to update member status.",
                deleteMember:
                    "Delete Member Permanently?",
                deleteWarning:
                    "This will permanently delete this member and all of their related payment and monthly obligation records.\n\nThis action cannot be undone.",
                deletePermanently:
                    "Delete Permanently",
                memberDeleted:
                    "Member Deleted",
                memberDeletedMessage:
                    "has been permanently deleted.",
                deleteError:
                    "Unable to delete the member. Please try again.",
                month: "/ month",
                inactiveMembers:
                    "Inactive members",
                activeMembers:
                    "Active members",
                add: "+ Add",
                active: "Active",
                inactive: "Inactive",
                noInactiveMembers:
                    "No inactive members",
                noMembers:
                    "No members yet",
                inactiveWillAppear:
                    "Inactive members will appear here.",
                addFirstMember:
                    "Add your first member to get started.",
            };

    const handleToggleActive = (
        member: Member
    ) => {
        const isDeactivating =
            member.isActive;

        Alert.alert(
            isDeactivating
                ? text.markInactive
                : text.reactivateMember,

            isDeactivating
                ? `${member.name} ${text.willBeInactive}`
                : `${member.name} ${text.willBeReactivated}`,

            [
                {
                    text: t.common.cancel,
                    style: "cancel",
                },

                {
                    text: isDeactivating
                        ? text.markInactive
                        : text.reactivate,

                    onPress: async () => {
                        try {
                            await setMemberActive(
                                member.id,
                                !member.isActive
                            );

                            await loadMembers();
                        } catch (error) {
                            console.error(
                                "Toggle member status error:",
                                error
                            );

                            Alert.alert(
                                t.common.error,
                                text.updateStatusError
                            );
                        }
                    },
                },
            ]
        );
    };

    const handleDeleteMember = (
        member: Member
    ) => {
        Alert.alert(
            text.deleteMember,

            `${text.deleteWarning.replace(
                "this member",
                member.name
            )}`,

            [
                {
                    text: t.common.cancel,
                    style: "cancel",
                },

                {
                    text: text.deletePermanently,
                    style: "destructive",

                    onPress: async () => {
                        try {
                            // Delete all payment records
                            // belonging to this member.
                            await deletePaymentsForMember(
                                member.id
                            );

                            // Delete all monthly obligation
                            // records belonging to this member.
                            await deleteMonthlyObligationsForMember(
                                member.id
                            );

                            // Delete the member itself.
                            // This also records the member
                            // deletion for cloud sync.
                            await deleteMember(
                                member.id
                            );

                            await loadMembers();

                            Alert.alert(
                                text.memberDeleted,
                                `${member.name} ${text.memberDeletedMessage}`
                            );
                        } catch (error) {
                            console.error(
                                "Delete member error:",
                                error
                            );

                            Alert.alert(
                                t.common.error,
                                text.deleteError
                            );
                        }
                    },
                },
            ]
        );
    };

    const renderMember = ({
                              item,
                          }: {
        item: Member;
    }) => (
        <View style={styles.card}>
            <View style={styles.memberInfo}>
                <Text style={styles.name}>
                    {item.name}
                </Text>

                <Text style={styles.mobile}>
                    {item.mobile}
                </Text>

                <Text style={styles.installment}>
                    ₹
                    {item.monthlyInstallment.toLocaleString(
                        "en-IN"
                    )}{" "}
                    {text.month}
                </Text>
            </View>

            <View style={styles.actions}>
                {/* Edit */}
                <TouchableOpacity
                    style={styles.editButton}
                    onPress={() =>
                        navigation.navigate(
                            "EditMember",
                            {
                                memberId: item.id,
                            }
                        )
                    }
                >
                    <Text style={styles.editText}>
                        {t.common.edit}
                    </Text>
                </TouchableOpacity>

                {/* Active / Inactive */}
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() =>
                        handleToggleActive(item)
                    }
                >
                    <Text style={styles.actionText}>
                        {item.isActive
                            ? text.inactive
                            : text.reactivate}
                    </Text>
                </TouchableOpacity>

                {/* Permanent Delete */}
                <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() =>
                        handleDeleteMember(item)
                    }
                >
                    <Text style={styles.deleteText}>
                        {text.deletePermanently}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>
                        {t.members.members}
                    </Text>

                    <Text style={styles.subtitle}>
                        {showInactive
                            ? text.inactiveMembers
                            : text.activeMembers}
                    </Text>
                </View>

                <TouchableOpacity
                    style={styles.addButton}
                    onPress={() =>
                        navigation.navigate(
                            "AddMember"
                        )
                    }
                >
                    <Text
                        style={
                            styles.addButtonText
                        }
                    >
                        {text.add}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Active / Inactive Tabs */}
            <View style={styles.tabs}>
                <TouchableOpacity
                    style={[
                        styles.tab,
                        !showInactive &&
                        styles.activeTab,
                    ]}
                    onPress={() =>
                        setShowInactive(false)
                    }
                >
                    <Text
                        style={[
                            styles.tabText,
                            !showInactive &&
                            styles.activeTabText,
                        ]}
                    >
                        {text.active}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.tab,
                        showInactive &&
                        styles.activeTab,
                    ]}
                    onPress={() =>
                        setShowInactive(true)
                    }
                >
                    <Text
                        style={[
                            styles.tabText,
                            showInactive &&
                            styles.activeTabText,
                        ]}
                    >
                        {text.inactive}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Member List */}
            {visibleMembers.length === 0 ? (
                <View
                    style={
                        styles.emptyContainer
                    }
                >
                    <Text
                        style={
                            styles.emptyTitle
                        }
                    >
                        {showInactive
                            ? text.noInactiveMembers
                            : text.noMembers}
                    </Text>

                    <Text
                        style={
                            styles.emptyText
                        }
                    >
                        {showInactive
                            ? text.inactiveWillAppear
                            : text.addFirstMember}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={visibleMembers}
                    keyExtractor={(item) =>
                        item.id
                    }
                    renderItem={renderMember}
                    contentContainerStyle={
                        styles.list
                    }
                    showsVerticalScrollIndicator={
                        false
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F7F8FA",
        paddingTop: 55,
    },

    header: {
        paddingHorizontal: 20,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },

    title: {
        fontSize: 28,
        fontWeight: "700",
        color: "#1F2937",
    },

    subtitle: {
        marginTop: 4,
        fontSize: 14,
        color: "#6B7280",
    },

    addButton: {
        backgroundColor: "#1F6FEB",
        paddingHorizontal: 18,
        paddingVertical: 11,
        borderRadius: 10,
    },

    addButtonText: {
        color: "#FFFFFF",
        fontSize: 15,
        fontWeight: "700",
    },

    tabs: {
        flexDirection: "row",
        marginHorizontal: 20,
        marginTop: 24,
        backgroundColor: "#E9EDF2",
        borderRadius: 10,
        padding: 4,
    },

    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: "center",
        borderRadius: 8,
    },

    activeTab: {
        backgroundColor: "#FFFFFF",
    },

    tabText: {
        fontSize: 14,
        fontWeight: "600",
        color: "#6B7280",
    },

    activeTabText: {
        color: "#1F6FEB",
    },

    list: {
        padding: 20,
        paddingBottom: 40,
    },

    card: {
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        elevation: 2,
    },

    memberInfo: {
        flex: 1,
    },

    name: {
        fontSize: 17,
        fontWeight: "700",
        color: "#1F2937",
    },

    mobile: {
        marginTop: 5,
        fontSize: 14,
        color: "#6B7280",
    },

    installment: {
        marginTop: 7,
        fontSize: 14,
        fontWeight: "600",
        color: "#374151",
    },

    actions: {
        marginLeft: 12,
        alignItems: "flex-end",
        gap: 8,
    },

    editButton: {
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 8,
        backgroundColor: "#EEF2F7",
    },

    editText: {
        fontSize: 12,
        fontWeight: "600",
        color: "#2563EB",
    },

    actionButton: {
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 8,
        backgroundColor: "#EEF2F7",
    },

    actionText: {
        fontSize: 12,
        fontWeight: "600",
        color: "#374151",
    },

    deleteButton: {
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 8,
        backgroundColor: "#FEE2E2",
    },

    deleteText: {
        fontSize: 12,
        fontWeight: "600",
        color: "#DC2626",
    },

    emptyContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 30,
    },

    emptyTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#374151",
    },

    emptyText: {
        marginTop: 8,
        textAlign: "center",
        fontSize: 14,
        color: "#6B7280",
    },
});