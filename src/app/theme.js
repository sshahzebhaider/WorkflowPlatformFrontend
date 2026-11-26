export const tokens = {
    primary: '#DC2626', primaryHover: '#B91C1C', primarySoft: '#FEF2F2', primaryTint: '#FFFBFB', primaryBorder: '#FECACA',
    ink: '#111827', inkSecondary: '#374151', subtle: '#6B7280', muted: '#9CA3AF', border: '#E5E7EB',
    bgLayout: '#F5F6FA', surface: '#FFFFFF', surface2: '#F4F6F9', success: '#16A34A', warning: '#D97706', info: '#1D4ED8'
};
export const theme = {
    token: { colorPrimary: tokens.primary, colorLink: tokens.primaryHover, colorText: tokens.ink, colorTextSecondary: tokens.subtle, colorBorder: tokens.border, colorBorderSecondary: tokens.border, colorBgLayout: tokens.bgLayout, borderRadius: 6, borderRadiusLG: 8, controlHeight: 36, fontSize: 14, fontFamily: "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif" },
    components: { Layout: { siderBg: '#fff', headerBg: '#fff' }, Menu: { itemBg: '#fff', itemSelectedBg: tokens.primarySoft, itemSelectedColor: tokens.primaryHover, groupTitleColor: tokens.muted, itemBorderRadius: 8, itemHeight: 38 }, Input: { controlHeight: 38 }, Select: { controlHeight: 38 }, InputNumber: { controlHeight: 38 }, Tabs: { inkBarColor: tokens.primary }, Table: { headerBg: tokens.surface2, headerColor: tokens.subtle, headerSplitColor: 'transparent', cellFontSize: 13, cellPaddingBlock: 11, cellPaddingInline: 14 }, Tag: { defaultBg: tokens.surface2 } }
};
