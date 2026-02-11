import { StyleSheet, TextStyle, ViewStyle } from 'react-native'

import spacings from '@common/styles/spacings'
import { ThemeProps } from '@common/styles/themeConfig'
import { BORDER_RADIUS_PRIMARY } from '@common/styles/utils/common'

interface Style {
  balanceCard: ViewStyle
  balanceLabel: TextStyle
  balanceValue: TextStyle
  loadingContainer: ViewStyle
}

const getStyles = (theme: ThemeProps) =>
  StyleSheet.create<Style>({
    balanceCard: {
      backgroundColor: theme.secondaryBackground,
      borderRadius: BORDER_RADIUS_PRIMARY,
      ...spacings.pLg,
      ...spacings.mbSm
    },
    balanceLabel: {
      color: theme.secondaryText
    },
    balanceValue: {
      color: theme.primaryText
    },
    loadingContainer: {
      ...spacings.pvLg
    }
  })

export default getStyles
