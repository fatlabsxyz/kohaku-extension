import React from 'react'
import Svg, { Path, SvgProps } from 'react-native-svg'

import useTheme from '@common/hooks/useTheme'

const ShieldIcon: React.FC<SvgProps> = ({
  width = 24,
  height = 24,
  color,
  strokeWidth = '1.5',
  ...rest
}) => {
  const { theme } = useTheme()
  return (
    <Svg width={width} height={height} fill="none" viewBox="0 0 24 24" {...rest}>
      <Path
        d="M12 2s-2.4 1.7-4.6 2.5C5.7 5.1 4 5.2 3.2 5.2c-.4 0-.7-.02-1.2-.06v8.22c0 1.34.31 2.64.93 3.87.55 1.09 1.34 2.12 2.34 3.06C6.93 21.88 9.17 23.1 11.43 23.8l.57.2.57-.17c2.28-.71 4.52-1.93 6.17-3.53 1-.94 1.79-1.97 2.34-3.06.62-1.23.93-2.53.93-3.87V5.14c-.46.04-.73.06-1.18.06-.81 0-2.4-.08-3.9-.58C14.63 3.83 12 2 12 2z"
        stroke={color || theme.iconSecondary}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9 12l2 2 4-4"
        stroke={color || theme.iconSecondary}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export default React.memo(ShieldIcon)
