import dayjs from 'dayjs'

import { Maybe } from '@utils/tsUtils'

export const NORSK_DATOFORMAT = 'DD.MM.YYYY'
export const NORSK_DATOFORMAT_MED_KLOKKESLETT = 'DD.MM.YYYY kl. HH.mm'

export const getFormattedDatetimeString = (datetime: Maybe<string>): string =>
    typeof datetime === 'string' ? dayjs(datetime).format(NORSK_DATOFORMAT_MED_KLOKKESLETT) : ''

export const getFormattedDateString = (date: Maybe<string>): string =>
    typeof date === 'string' ? dayjs(date).format(NORSK_DATOFORMAT) : ''
