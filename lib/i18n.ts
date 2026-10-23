export type LocaleCode = "pt-BR" | "en-US"

export type LanguageEntry = {
  code: LocaleCode
  label: string
  nativeLabel: string
  shortLabel: string
}

export const DEFAULT_LOCALE: LocaleCode = "pt-BR"
export const LANGUAGE_STORAGE_KEY = "sunano:locale"

export const LANGUAGE_OPTIONS: LanguageEntry[] = [
  {
    code: "pt-BR",
    label: "Português",
    nativeLabel: "Português (Brasil)",
    shortLabel: "PT",
  },
  {
    code: "en-US",
    label: "English",
    nativeLabel: "English (US)",
    shortLabel: "EN",
  },
]

export function isLocaleCode(value: string): value is LocaleCode {
  return LANGUAGE_OPTIONS.some((option) => option.code === value)
}

export function getLocale(value?: string | null): LocaleCode {
  if (!value) return DEFAULT_LOCALE
  return isLocaleCode(value) ? value : DEFAULT_LOCALE
}

/**
 * Melhor idioma suportado a partir da lista do navegador.
 *
 * `navigator.languages` vem em ordem de preferência ("en-GB", "pt-BR", …).
 * Comparamos pela subtag primária para que qualquer variante de inglês
 * (en-GB, en-AU) caia em en-US, e qualquer português (pt, pt-PT) em pt-BR —
 * casar a string inteira erraria em praticamente todo visitante estrangeiro.
 *
 * Devolve `null` quando nenhum idioma da lista é suportado: aí quem chama
 * decide o padrão, em vez de recebermos pt-BR disfarçado de "detectado".
 */
export function matchBrowserLocale(languages: readonly string[] | undefined): LocaleCode | null {
  if (!languages?.length) return null

  for (const language of languages) {
    const primary = language.toLowerCase().split("-")[0]
    const match = LANGUAGE_OPTIONS.find(
      (option) => option.code.toLowerCase().split("-")[0] === primary
    )
    if (match) return match.code
  }

  return null
}

export function getLanguageEntry(locale: LocaleCode) {
  return LANGUAGE_OPTIONS.find((option) => option.code === locale) ?? LANGUAGE_OPTIONS[0]
}

// ─────────────────────────────────────────────────────────────────────────────
// Translation Dictionary
// ─────────────────────────────────────────────────────────────────────────────

export type CategoryKey =
  | "keyboard"
  | "pcb"
  | "mouse"
  | "mousepad"
  | "glasspad"
  | "iem"
  | "headset"
  | "feet"
  | "chairs"
  | "monitors"
  | "switches"
  | "dac_amp"
  | "psu"

export type Translations = {
  topbar: {
    languageLabel: string
    languageHelper: string
    themeLabel: string
    themeHelper: string
  }
  notifications: {
    title: string
    ariaLabel: string
    empty: string
    error: string
    dismiss: string
    unreadOne: string
    /** `{count}` = número de não lidas. */
    unreadMany: string
    systemTitle: string
    /** `{name}` = quem causou; `{amount}` = aura ganha. */
    auraFromActor: string
    auraSelf: string
    postComment: string
    commentReply: string
    newFollower: string
    mention: string
    /** `{name}` = quem postou. */
    newPost: string
    orderStatusFallback: string
    /** `{name}` = quem respondeu (nome do admin). */
    supportReply: string
    /** `{name}` = quem abriu o chamado (nome do usuário). */
    supportNewTicket: string
    /** Aviso à equipe. `{name}` = cliente, `{number}` = número curto do pedido. */
    orderPaid: string
    /** `{name}` = quem respondeu (nome do usuário). */
    supportUserReply: string
    /** `{subject}` = assunto do chamado. */
    supportStatus: string
    supportStatusResolved: string
    supportStatusCancelled: string
    supportStatusReopened: string
    /** `{product}` = nome do produto que voltou ao estoque. */
    storeRestock: string
    affiliatePayoutFallback: string
    rankFrameFallback: string
    /** `{name}` = marca + modelo do periférico pedido. */
    peripheralRequestStatus: string
    peripheralRequestPending: string
    peripheralRequestInReview: string
    peripheralRequestAdded: string
    peripheralRequestDuplicate: string
    peripheralRequestRejected: string
    peripheralRequestNew: string
    viewAll: string
    historyTitle: string
    historySubtitle: string
    loadMore: string
    loadingMore: string
    clearAll: string
    clearAllConfirm: string
    clearing: string
    markRead: string
    markUnread: string
    markAllRead: string
    /** Selo do cabeçalho do sino: o que chegou desde a última abertura. */
    newOne: string
    /** `{count}` = quantas chegaram desde a última abertura. */
    newMany: string
    emptyTitle: string
    emptyHint: string
    filterEmpty: string
    filterAll: string
    filterOrders: string
    filterSupport: string
    filterCommunity: string
    filterAura: string
    groupToday: string
    groupYesterday: string
    groupWeek: string
    groupOlder: string
  }
  nav: {
    home: string
    peripherals: string
    softwares: string
    content: string
    news: string
    videos: string
    forum: string
    store: string
    used: string
    offers: string
    people: string
    events: string
    /** Rótulo da última seção da sidebar (Patch Notes, VIP, informações). */
    more: string
    patchNotes: string
    info: string
  }
  common: {
    all: string
    allFem: string
    any: string
    search: string
    filters: string
    clear: string
    brand: string
    price: string
    cancel: string
    delete: string
    deleting: string
    edit: string
    new: string
    selected: string
    compare: string
    actions: string
    type: string
    profile: string
    settings: string
    users: string
    content: string
    signOut: string
  }
  categories: {
    labels: Record<CategoryKey, string>
    descriptions: Record<CategoryKey, string>
    others: string
    othersDescription: string
  }
  filters: {
    searchPeripherals: string
    searchPlaceholder: string
    filtersLabel: string
    filterTierlist: string
    filterDesc: string
    priceRange: string
    mouseShape: string
    keyboardLayout: string
    youtubeReview: string
    clearFilters: (count: number) => string
    itemCount: (count: number) => string
    searchBadge: string
    allBrands: string
    searchBrand: string
    sortBy: string
    recentlyAdded: string
    bestRanked: string
    nameAZ: string
    nameZA: string
    priceAsc: string
    priceDesc: string
    connectivity: string
    shape: string
    weight: string
    surface: string
    padType: string
    refreshRate: string
    panelType: string
    wired: string
    wireless: string
    category: string
    symmetrical: string
    ergonomic: string
    asymmetrical: string
    mechanical: string
    magnetic: string
    optical: string
    cloth: string
    glass: string
    hybrid: string
    profile: string
    brl: string
    searchNameBrand: string
    productCount: (count: number) => string
    activeFilters: string
    budgetBand: string
    golpeBand: string
    tags: string
  }
  tierlist: {
    info: string
    about: { title: string; p1: string; p2: string; p3: string }
    categoriesTab: { title: string; p1: string; p2: string }
    tagsTab: { title: string; p1: string; p2: string }
    tiers: {
      title: string
      intro: string
      goat: string
      ss: string
      s: string
      a: string
      b: string
      c: string
      l: string
      u: string
    }
    criteria: { title: string; intro: string; item1: string; item2: string; item3: string; item4: string }
    latestUpdate: { title: string; dateFormat: string; description: string }
    views: { official: string; mine: string; community: string }
    howItWorks: string
    moreInfo: string
    updatedAt: (date: string) => string
    community: {
      title: string
      subtitle: string
      sortHearts: string
      sortItems: string
      sortRecent: string
      empty: string
      viewFull: string
      seeAll: string
      itemsCount: (count: number) => string
      pageOf: (current: number, total: number) => string
      prev: string
      next: string
    }
    viewingBy: string
    comingSoon: string
    comingSoonDesc: string
    noItems: string
    underReview: string
    tierDescriptions: { GOAT: string; SS: string; S: string; A: string; B: string; C: string; L: string }
    tierSubtitles: { GOAT: string; SS: string; S: string; A: string; B: string; C: string; L: string }
    modeDescriptions: { oled: string; overall: string; value: string; soundTyping: string; mechanical: string; magnetic: string; pcb: string; recommended: string; ips_va: string; competitive: string }
    /** Aba "Velocidade" de mousepad/glasspad/feet (lib/speed-chart.ts). */
    speedChart: {
      tab: string
      description: string
      slow: string
      fast: string
      textured: string
      smooth: string
      disclaimer: string
      empty: string
      previewNotice: string
      /** `speed`/`texture` já vêm formatados na escala 0–10 (`formatSpeedChartValue`). */
      itemSummary: (name: string, speed: string, texture: string) => string
    }
  }
  peripherals: {
    title: string
    subtitle: string
    gamingGearDb: string
    findAndCompare: string
    gamingPeripherals: string
    notFound: string
    adjustFilters: string
    /** Botão do cabeçalho e link do estado vazio → /perifericos/pedidos. */
    requestCta: string
    requestEmptyHint: string
    ranking: string
    new: string
    searchNameBrand: string
    delete: {
      title: string
      aboutToDelete: string
      cannotUndo: string
      confirm: string
      success: string
      error: string
      failed: string
    }
  }
  peripheralDetail: {
    classification: string
    underReview: string
    overallRatings: string
    ratingScale: string
    ratingGeneral: string
    ratingBuild: string
    ratingSurface: string
    ratingComponents: string
    ratingSoftware: string
    ratingBase: string
    ratingEfficiency: string
    ratingBattery: string
    ratingTyping: string
    ratingStitching: string
    ratingSpeed: string
    ratingPackaging: string
    ratingWarranty: string
    ratingPerformance: string
    ratingRipple: string
    ratingQc: string
    ratingValue: string
    ratingTuning: string
    ratingCable: string
    ratingTips: string
    ratingQualityControl: string
    software: string
    softwareEmpty: string
    artAndRarity: string
    artByArtist: string
    artAiUsage: string
    artLimitedDrop: string
    artDropQuantity: string
    artDropUnits: string
    artLaunchCountry: string
    artArtistSocial: string
    answerYes: string
    answerNo: string
    communityReviews: string
    whereToBuy: string
    whereToBuyDesc: string
    buyInStore: string
    soldOut: string
    components: string
    performance: string
    performanceDesc: string
    mainSpecs: string
    shape: string
    shapeDesc: string
    size: string
    dimensions: string
    shapePhotoEmpty: string
    tuningCurve: string
    tuningCurveDesc: string
    switchSound: string
    switchSoundDesc: string
    switchSoundEmpty: string
    glide: string
    glideDesc: string
    grip: string
    gripDesc: string
    youtubeReview: string
    viewReview: string
    expertComments: string
    overloadTest: string
    overloadTestDesc: string
    noStrengths: string
    noWeaknesses: string
    noExpertComments: string
    videoReview: string
    specsTitle: string
    specsTitleTechnical: string
    prosTitle: string
    consTitle: string
    gripSmall: string
    gripMedium: string
    gripLarge: string
    /** Rótulos das linhas de especificação, por categoria. */
    spec: {
      averagePrice: string
      averageValue: string
      latency: string
      switch: string
      sensor: string
      pollingRate: string
      coating: string
      trimode: string
      battery: string
      batteryLife: string
      layout: string
      type: string
      connectivity: string
      weight: string
      deadzone: string
      rtMin: string
      features: string
      surface: string
      padType: string
      size: string
      profile: string
      thickness: string
      padGlide: string
      padSpeed: string
      stoppingPower: string
      edgeFinish: string
      panel: string
      refreshRate: string
      compatibility: string
      drivers: string
      impedance: string
      sensitivity: string
      connector: string
      plug: string
      material: string
      microphone: string
      warranty: string
      wattage: string
      actuationForce: string
      totalTravel: string
      magneticFlux: string
      housing: string
      stemType: string
    }
    /** Valores enumerados exibidos nas specs. */
    value: {
      wired: string
      wireless: string
      mechanical: string
      optical: string
      magnetic: string
      spdt: string
      yes: string
      no: string
    }
  }
  pageHeader: {
    home: string
    homeDesc: string
    news: string
    newsDesc: string
    peripherals: string
    peripheralsDesc: string
    tierlist: string
    tierlistDesc: string
    guides: string
    guidesDesc: string
    offers: string
    offersDesc: string
    forum: string
    forumDesc: string
    people: string
    peopleDesc: string
    achievements: string
    achievementsDesc: string
    myProfile: string
    myProfileDesc: string
    account: string
    accountDesc: string
    videos: string
    videosDesc: string
    changelog: string
    changelogDesc: string
    review: string
    peripheral: string
    profile: string
    profileDesc: string
    listing: string
    fallback: string
    back: string
  }
  changelogBanner: {
    /** `{version}` = versão da entrada mais recente. */
    newLabel: string
    viewHistory: string
    close: string
  }
  psu: {
    load100: string
    load100Hint: string
    load110: string
    load110Hint: string
    protectionWorked: string
    maxLoad: string
    rippleStable: string
    ripple12v: string
    efficiency: string
    maxTemp: string
    fanModel: string
    circuitType: string
    mainCapacitor: string
    secondaryCapacitor: string
    line33v: string
    line5v: string
  }
  storeBadges: {
    readyStock: string
    preOrder: string
    officialStore: string
    buy: string
  }
  verdict: {
    title: string
    good: string
    bad: string
    tie: string
    goodTooltip: string
    badTooltip: string
    tieTooltip: string
    noReviews: string
    /** `{count}` = total de reviews. */
    reviewCount: string
    reviewCountOne: string
  }
  admin: {
    sidebar: {
      general: string
      peripherals: string
      content: string
      shop: string
      system: string
      users: string
      settings: string
      offers: string
      store: string
      newsAndReviews: string
      forum: string
      actions: string
      viewSite: string
      signOut: string
    }
    dashboard: {
      title: string
      subtitle: string
      greetingMorning: string
      greetingAfternoon: string
      greetingEvening: string
      liveLabel: string
      overview: string
      quickActions: string
      needsAttention: string
      allCaughtUp: string
      statPeripherals: string
      statPeripheralsCaption: (count: number) => string
      statBlog: string
      statBlogCaption: (count: number) => string
      statForum: string
      statForumCaption: (count: number) => string
      statStore: string
      statStoreCaption: (count: number) => string
      statOffers: string
      statOffersCaption: string
      statBanners: string
      statBannersCaption: (active: number, max: number) => string
      statSupport: string
      statSupportCaption: (resolved: number, cancelled: number) => string
      statVisitorsCardTitle: string
      statVisitorsTabDay: string
      statVisitorsTabWeek: string
      statVisitorsTabMonth: string
      statVisitorsTabYear: string
      statVisitorsCaption: (period: "day" | "week" | "month" | "year") => string
      statVisitorsWeekOfMonth: (n: number) => string
      statVisitorsEmpty: string
      performanceOverview: string
      performanceCardTitle: string
      performanceTabToday: string
      performanceTabWeek: string
      performanceInteractionsLabel: string
      performanceAuraLabel: string
      revenueOverview: string
      revenueCardTitle: string
      revenueCaption: (period: "day" | "week" | "month" | "year") => string
      revenueEmpty: string
      topProductsCardTitle: string
      topProductsEmpty: string
      topProductsUnitsLabel: (count: number) => string
      hideFinancialsLabel: string
      showFinancialsLabel: string
      financialsHiddenLabel: string
      gaugeTitle: string
      gaugeCaption: (approved: number, total: number) => string
      gaugePendingLabel: (count: number) => string
      gaugeEmptyLabel: string
      attentionPendingReview: (count: number) => string
      attentionDrafts: (count: number) => string
      attentionOutOfStock: (count: number) => string
      actionNewPeripheral: string
      actionOrganizeTierList: string
      actionWritePost: string
      actionModerateForum: string
      actionViewOffers: string
      actionNewProduct: string
      actionBanners: string
      actionRanking: string
      actionVideos: string
      actionUsers: string
      actionSettings: string
    }
    blog: {
      failedToLoad: string
      failedToDelete: string
      articleDeleted: string
      confirmDelete: string
      published: string
      draft: string
      drafts: string
      news: string
      reviews: string
      newNews: string
      newReview: string
      nothingFound: string
      nothingYet: string
      differentSearch: string
      createFirst: string
      postPublished: string
      newsType: string
      pageTitle: string
      pageDescription: string
      items: (count: number, filtered: boolean) => string
      form: {
        editReview: string
        editNews: string
        newReview: string
        newNews: string
        reviewDesc: string
        newsDesc: string
        failedToLoadPeripherals: string
        failedToLoadArticle: string
        failedToUploadCover: string
        failedToUploadThumbnail: string
        failedToSave: string
        articleUpdated: string
        articleCreated: string
        articles: string
        edit: string
        new: string
        contentType: string
        newsType: string
        newsTypeDesc: string
        reviewTypeDesc: string
        titlePlaceholder: string
        chars: string
        summaryLabel: string
        summaryPlaceholder: string
        featuredLabel: string
        featuredDesc: string
        featuredOn: string
        featuredOff: string
        relatedPeripheral: string
        change: string
        searchBrandOrName: string
        loadingPeripherals: string
        noPeripheralsFound: string
        coverImages: string
        articleHeader: string
        cardThumbnail: string
        changeImage: string
        clickToUpload: string
        optionalAdapts: string
        recommendedShown: string
        videoLink: string
        articleContent: string
        contentPlaceholder: string
        publicationStatus: string
        publishedLabel: string
        draftLabel: string
        visibleToAll: string
        visibleToAdmins: string
        uploadingHeader: string
        uploadingThumbnail: string
        saving: string
        saveChanges: string
        publish: string
        offerImage: string
        offerPreview: string
        clickToUploadOffer: string
        offerName: string
        offerNameRequired: string
        offerLink: string
        offerLinkRequired: string
        price: string
        currency: string
        symbol: string
        linkedPeripheral: string
        selectPeripheral: string
        noLinkedPeripheral: string
        couponCode: string
        expirationDate: string
        cancel: string
        update: string
        create: string
        offer: string
        failedToLoadPeripheralsOffer: string
        failedToUploadOfferImage: string
        failedToSaveOffer: string
        offerUpdated: string
        offerCreated: string
        offerNameMin: string
        offerLinkFull: string
        priceGtZero: string
      }
    }
    users: {
      failedToLoad: string
      failedToSave: string
      userUpdated: string
      failedToSaveUser: string
      inviteSent: string
      failedToCreate: string
      pageTitle: string
      pageDescription: string
      webMasterOnly: string
      newUser: string
      userCreated: string
      inviteNewUser: string
      displayName: string
      displayNamePlaceholder: string
      role: string
      webmaster: string
      admin: string
      moderator: string
      editor: string
      vendedor: string
      suporte: string
      user: string
      initialPermissions: string
      sending: string
      sendInvite: string
      noUsersFound: string
      read: string
      edit: string
      saving: string
      save: string
      cancel: string
      password: string
      locked: string
      changePassword: string
      newPasswordPlaceholder: string
      regularUserNote: string
      webMasterProtected: string
      vipLabel: string
      vipAutoByRole: string
      vipManualGrant: string
      vipManualRevoke: string
      failedToUpdateVip: string
      storeAccessLabel: string
      storeAccessGrant: string
      storeAccessRevoke: string
      storeAccessOnHint: string
      storeAccessOffHint: string
      storeAccessGranted: string
      storeAccessRevoked: string
      failedToUpdateStoreAccess: string
      makeWebMaster: (name: string) => string
      makeWebMasterDesc: string
      confirmMakeWebMaster: string
      failedToChangePassword: string
      passwordChanged: string
      failedToCreateUser: string
      searchPlaceholder: string
      noResultsFiltered: string
      statTotal: string
      statWebMasters: string
      statAdmins: string
      statModerators: string
      statEditors: string
      statVendedores: string
      statSuportes: string
      statRegular: string
      statBanned: string
      statVip: string
      statNew30d: string
      statActive30d: string
      statNoProfile: string
      filterStatusLabel: string
      filterStatusAll: string
      filterStatusBanned: string
      filterStatusVip: string
      filterStatusStoreAccess: string
      filterStatusNoProfile: string
      sortLabel: string
      sortRecent: string
      sortOldest: string
      sortNameAsc: string
      sortNameDesc: string
      sortEmailAsc: string
      perPage: string
      pageOf: (page: number, total: number) => string
      showingRange: (from: number, to: number, total: number) => string
      prevPage: string
      nextPage: string
      clearFilters: string
      noProfileBadge: string
      noProfileHint: string
      neverSignedIn: string
      lastSeen: (when: string) => string
      searchHint: string
      deleteUser: string
      deleteUserTitle: (name: string) => string
      deleteUserDesc: string
      deleteConfirmLabel: (email: string) => string
      confirmDelete: string
      userDeleted: string
      failedToDelete: string
      cannotDeleteSelf: string
      cannotDeleteWebMaster: string
      staffSectionTitle: string
      membersSectionTitle: string
      banUser: string
      unbanUser: string
      banUserTitle: (name: string) => string
      banUserDesc: string
      banReasonLabel: string
      banReasonPlaceholder: string
      confirmBan: string
      unbanUserTitle: (name: string) => string
      unbanUserDesc: string
      confirmUnban: string
      userBanned: string
      userUnbanned: string
      failedToBan: string
      failedToUnban: string
      bannedBadge: string
      banReasonPrefix: string
    }
    offers: {
      failedToLoad: string
      pageTitle: string
      pageDescription: string
      telegramOffer: string
      noMessages: string
      openInTelegram: string
    }
    maintenance: {
      pageTitle: string
      pageDescription: string
      currentStatus: string
      stateFromEnv: string
      active: string
      inactive: string
      reopen: string
    }
    tierlistForm: {
      parentPeripherals: string
      parentTierlist: string
      headerEdit: string
      headerNew: string
      headerEditDesc: string
      headerNewDesc: string
      pickerSearchStore: string
      pickerTypeToFilter: string
      pickerClose: string
      pickerLoading: string
      pickerNoItems: string
      failedLoadPeripheral: string
      selectTag: string
      readOnlyBanner: string
      readOnlyNoPermission: string
      failedUploadImage: string
      failedSave: string
      updated: string
      created: string
      failedSaveLinked: string
      failedSavePeripheral: string
      failedRemoveBg: string
      currentLoading: string
      currentEdit: string
      currentNew: string
      loadingPeripheral: string
      loadingPeripheralDesc: string
      sectionImage: string
      clickChangeImage: string
      clickUploadImage: string
      removingBg: string
      restoreOriginalBg: string
      removeBg: string
      removeBgStrong: string
      bgStrongHint: string
      bgRemovedAuto: string
      bgBestWithSolid: string
      sectionBasicInfo: string
      category: string
      name: string
      charsHint: string
      brand: string
      selectBrand: string
      searchBrand: string
      brandHint: string
      priceUsd: string
      tierHint: string
      underReview: string
      reviewCategoryLabel: string
      reviewCategoryHint: string
      reviewApprovedLabel: string
      reviewNotApprovedLabel: string
      selectAtLeastOneTag: string
      sectionRatings: string
      sectionTechnicalSpecs: string
      sectionWikiContent: string
      sectionLinkedProducts: string
      linkedStoreProduct: string
      sectionBuyLinks: string
      cancel: string
      saving: string
      saveChanges: string
      createPeripheral: string
    }
    tierlistPage: {
      newPeripheral: string
      dragAndDropHint: string
      orderUpdated: string
      tierRemoved: string
      movedToTier: (tier: string) => string
      movedToPriceBand: (band: string) => string
      failedToLoad: string
      failedToLoadPeripherals: string
      failedToUpdate: string
      failedToUpdateOrder: string
      failedToUpdateOrderDesc: string
      failedToUpdatePeripheral: string
      underReviewPeripherals: string
      dragToTierDesc: string
      dropToRemoveDesc: string
      releaseToRemove: string
      dropHereRemove: string
      noUnassigned: string
      noPriceBandPeripherals: string
      noPriceBandDesc: string
      noPriceBandEmpty: string
      itemsCount: (count: number) => string
      modeDescriptions: { performance: string; value: string; recommended: string; oled: string; soundTyping: string; mechanical: string; magnetic: string; pcb: string; ips_va: string; competitive: string }
      addToCategory: string
      searchPeripheralPlaceholder: string
      noLinkablePeripherals: string
      addedToCategory: string
      addToCategoryFailed: string
      removeFromCategoryAction: string
      removedFromCategory: string
      removeFromCategoryFailed: string
      addToRowAction: string
    }
    tierlistReview: {
      pageTitle: string
      pageDescription: string
      backToDashboard: string
      failedToLoad: string
      empty: string
      emptyDesc: string
      searchPlaceholder: string
      categoryPerformance: string
      categoryStore: string
      categoryVideoReview: string
      categorySpecsComments: string
      filterAll: string
      approve: string
      approvedToast: string
      updateFailed: string
      allApproved: string
      allApprovedDesc: string
    }
  }
  settings: {
    title: string
    subtitle: string
    adminProfile: string
    adminProfileDesc: string
    thisNameOnArticles: string
    accountEmail: string
    cannotChange: string
    displayName: string
    displayNamePlaceholder: string
    preview: string
    saving: string
    saveProfile: string
    profileSaved: string
    profileSavedDesc: string
    failedToSave: string
    failedToLoadProfile: string
    changePassword: string
    exclusiveToWebmaster: string
    currentPassword: string
    newPassword: string
    minChars: string
    confirmPassword: string
    repeatPassword: string
    passwordsDoNotMatch: string
    passwordUpdatedSuccess: string
    updatePassword: string
    passwordUpdated: string
    failedToChangePassword: string
    avatarUploaded: string
    failedToUploadAvatar: string
    passwordMin8: string
    youtubeSync: string
    youtubeSyncDesc: string
    available: string
    notAvailable: string
    lastSync: string
    moderator: string
    youTubeSynced: string
    youTubeSnapshotRefreshed: string
    failedToRefresh: string
    failedToRefreshYoutube: string
    outdated: string
    upToDate: string
    reloadStatus: string
    refreshing: string
    syncing: string
    forceRefresh: string
    failedToLoadProfileMsg: string
  }
  auth: {
    myProfile: string
    accountSettings: string
    myOrders: string
    myOrdersPending: (count: number) => string
    myOrdersAttention: string
    myTickets: string
    support: string
    supportAwaiting: string
    savedPosts: string
    affiliates: string
    adminPanel: string
    signOut: string
    settings: string
    viewProfile: string
    accountShort: string
    ordersShort: string
    savedShort: string
    ticketsShort: string
    affiliatesShort: string
    adminShort: string
  }
  blog: {
    title: string
    subtitle: string
    searchPlaceholder: string
    sortLabel: string
    loading: string
    failedToLoad: string
    articleOnBlog: string
    tagBlog: string
    minRead: (count: number) => string
    noArticles: string
    comingSoon: string
    articleNotFound: string
    backToBlog: string
    viewTierlist: string
    noPeripheral: string
    by: string
    relatedVideo: string
    externalVideo: string
  }
  offers: {
    title: string
    livePill: string
    disclaimer: string
    refresh: string
    join: string
    telegramChannel: string
    /** Convite pro canal, na barra lateral: título, linha de apoio e botão. */
    joinCardTitle: string
    joinCardSubtitle: string
    joinCardAction: string
    noMessages: string
    tryLater: string
    new: string
    offerImage: string
    openInTelegram: string
    failedToLoad: string
    prev: string
    next: string
    dateFormat: string
    subtitle: string
    copyCoupon: string
    copied: string
    couponCopied: string
    copyFailed: string
    coupon: string
    coupons: string
    seeOffer: string
    pixPrice: string
    installmentPrice: string
    searchPlaceholder: string
    noResults: string
    clearFilters: string
    filterAll: string
    filterCoupons: string
    filterNew: string
    sortRecent: string
    sortPrice: string
    sortLabel: string
    statsTitle: string
    statLive: string
    statWithCoupon: string
    statNewToday: string
    lastUpdated: string
    howItWorks: string
    howItWorksBody: string
    aliexpressAppHint: string
    showingCount: string
    oldOffer: string
    oldOfferHint: string
  }
  maintenance: {
    mode: string
    title: string
    body1: string
    body2: string
    tryAgain: string
    gameTitle: string
    gameIntro: string
    gameStart: string
    gameRestart: string
    gameScore: string
    gameBest: string
    gameOver: string
    gameNewBest: string
    gameCombo: string
    gameLives: string
    gameRating: string
    gameNice: string
    gameWas: string
    statusChecking: string
    statusStillDown: string
    statusBackOnline: string
    statusBackAction: string
  }
  changelog: {
    title: string
    description: string
    entries: {
      version: string
      date: string
      title: string
      description: string
      items: string[]
    }[]
  }
  errorPages: {
    notFoundTitle: string
    notFoundBody: string
    errorTitle: string
    errorBody: string
    errorDigest: (digest: string) => string
    backHome: string
    backDashboard: string
    goBack: string
    tryAgain: string
    quickLinks: string
    linkPeripherals: string
    linkTierlist: string
    linkBlog: string
    linkForum: string
  }
}

// Os dicionários moram em `i18n-pt-br.ts` (estático, padrão) e
// `i18n-en-us.ts` (carregado sob demanda pelo LocaleProvider). Para ler o
// texto use `useT()` no cliente ou `ptBR` direto no servidor.
