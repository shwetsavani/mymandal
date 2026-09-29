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
    getMembers,
    setMemberActive,
    type Member,
} from "../database/memberStorage";

import { useNavigation } from "@react-navigation/native";

import type {
    NativeStackNavigationProp,
} from "@react-navigation/native-stack";

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

    const [members, setMembers] =
        useState<Member[]>([]);

    const [showInactive, setShowInactive] =
        useState(false);

    const loadMembers = async () => {
        const data = await getMembers();

        setMembers(data);
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

    const handleToggleActive = (
        member: Member
    ) => {
        const action = member.isActive
            ? "deactivate"
            : "reactivate";

        Alert.alert(
            member.isActive
                ? "Mark Inactive"
                : "Reactivate Member",

            `${member.name} will be ${action}d.`,

            [
                {
                    text: "Cancel",
                    style: "cancel",
                },

                {
                    text: member.isActive
                        ? "Mark Inactive"
                        : "Reactivate",

                    onPress: async () => {
                        await setMemberActive(
                            member.id,
                            !member.isActive
                        );

                        await loadMembers();
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
                    / month
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
                                memberId:
                                item.id,
                            }
                        )
                    }
                >
                    <Text style={styles.editText}>
                        Edit
                    </Text>
                </TouchableOpacity>

                {/* Active / Inactive */}
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() =>
                        handleToggleActive(
                            item
                        )
                    }
                >
                    <Text style={styles.actionText}>
                        {item.isActive
                            ? "Inactive"
                            : "Reactivate"}
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
                        Members
                    </Text>

                    <Text style={styles.subtitle}>
                        {showInactive
                            ? "Inactive members"
                            : "Active members"}
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
                        + Add
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
                        Active
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
                        Inactive
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
                            ? "No inactive members"
                            : "No members yet"}
                    </Text>

                    <Text
                        style={
                            styles.emptyText
                        }
                    >
                        {showInactive
                            ? "Inactive members will appear here."
                            : "Add your first member to get started."}
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