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

type Translations = {
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
    loadMore: string
    loadingMore: string
    clearAll: string
    clearAllConfirm: string
    clearing: string
    markRead: string
    markUnread: string
    markAllRead: string
  }
  nav: {
    home: string
    peripherals: string
    content: string
    shop: string
    news: string
    videos: string
    forum: string
    store: string
    market: string
    used: string
    offers: string
    people: string
    events: string
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
    viewingBy: string
    comingSoon: string
    comingSoonDesc: string
    noItems: string
    underReview: string
    tierDescriptions: { GOAT: string; SS: string; S: string; A: string; B: string; C: string; L: string }
    tierSubtitles: { GOAT: string; SS: string; S: string; A: string; B: string; C: string; L: string }
    modeDescriptions: { oled: string; overall: string; value: string; soundTyping: string; mechanical: string; magnetic: string; pcb: string; recommended: string; ips_va: string; competitive: string }
  }
  peripherals: {
    title: string
    subtitle: string
    gamingGearDb: string
    findAndCompare: string
    gamingPeripherals: string
    notFound: string
    adjustFilters: string
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
      storeAndBazar: string
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
      moderator: string
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
      makeWebMaster: (name: string) => string
      makeWebMasterDesc: string
      confirmMakeWebMaster: string
      failedToChangePassword: string
      passwordChanged: string
      failedToCreateUser: string
      tier: string
      tierUpdated: string
      searchPlaceholder: string
      noResultsFiltered: string
      statTotal: string
      statWebMasters: string
      statAdmins: string
      statModerators: string
      statRegular: string
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
      pickerSearchBazaar: string
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
      linkedBazaarItem: string
      sectionBuyLinks: string
      cancel: string
      saving: string
      saveChanges: string
      createPeripheral: string
    }
    login: {
      title: string
      description: string
      password: string
      yourPassword: string
      signIn: string
      signingIn: string
      or: string
      forgotPassword: string
      continueWithGoogle: string
      continueWithDiscord: string
      passwordReset: string
      passwordResetDesc: string
      sendResetLink: string
      sending: string
      resetSentIfRegistered: string
      backToLogin: string
      enterEmail: string
      enterValidEmail: string
      errors: { missingCredentials: string; invalidCredentials: string; noAdminAccess: string }
    }
    tierlistPage: {
      newPeripheral: string
      dragAndDropHint: string
      orderUpdated: string
      tierRemoved: string
      movedToTier: (tier: string) => string
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
      itemsCount: (count: number) => string
      modeDescriptions: { performance: string; value: string; recommended: string; oled: string; soundTyping: string; mechanical: string; magnetic: string; pcb: string; ips_va: string; competitive: string }
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
    adminPanel: string
    signOut: string
    settings: string
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
    noMessages: string
    tryLater: string
    new: string
    offerImage: string
    openInTelegram: string
    failedToLoad: string
    prev: string
    next: string
    dateFormat: string
  }
  maintenance: {
    mode: string
    title: string
    body1: string
    body2: string
    signInAsAdmin: string
    tryAgain: string
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

export const translations: Record<LocaleCode, Translations> = {
  "pt-BR": {
    topbar: {
      languageLabel: "Idioma",
      languageHelper: "Escolha o idioma da interface",
      themeLabel: "Tema",
      themeHelper: "Escolha um clima de cor",
    },
    notifications: {
      title: "Notificações",
      ariaLabel: "Notificações",
      empty: "Nenhuma notificação por enquanto.",
      error: "Não foi possível carregar suas notificações.",
      dismiss: "Dispensar",
      unreadOne: "1 não lida",
      unreadMany: "{count} não lidas",
      systemTitle: "Aviso do sistema",
      auraFromActor: "{name} te deu +{amount} de Aura",
      auraSelf: "Você farmou +{amount} de Aura",
      postComment: "{name} comentou no seu post",
      commentReply: "{name} respondeu ao seu comentário",
      newFollower: "{name} começou a seguir você",
      mention: "{name} mencionou você em um comentário",
      newPost: "{name} publicou um novo post",
      loadMore: "Carregar mais",
      loadingMore: "Carregando...",
      clearAll: "Limpar",
      clearAllConfirm: "Apagar todas as notificações? Essa ação não pode ser desfeita.",
      clearing: "Limpando...",
      markRead: "Marcar como lida",
      markUnread: "Marcar como não lida",
      markAllRead: "Marcar todas como lidas",
    },
    nav: {
      home: "Início",
      peripherals: "Periféricos",
      content: "Comunidade",
      shop: "Loja",
      news: "Notícias",
      videos: "Vídeos e redes sociais",
      forum: "Fórum",
      store: "Loja",
      market: "Mercado",
      used: "Usado",
      offers: "Promoções",
      people: "Usuários",
      events: "Conquistas",
    },
    common: {
      all: "Todos",
      allFem: "Todas",
      any: "Qualquer",
      search: "Buscar",
      filters: "Filtros",
      clear: "Limpar",
      brand: "Marca",
      price: "Preço",
      cancel: "Cancelar",
      delete: "Deletar",
      deleting: "Deletando...",
      edit: "Editar",
      new: "Novo",
      selected: "Selecionado",
      compare: "Comparar",
      actions: "Ações",
      type: "Tipo",
      profile: "Perfil",
      settings: "Configurações",
      users: "Usuários",
      content: "Conteúdo",
      signOut: "Sair",
    },
    categories: {
      labels: {
        keyboard: "Teclados",
        pcb: "PCBs",
        mouse: "Mouses",
        mousepad: "Mousepads",
        glasspad: "Glasspads",
        iem: "IEMs",
        headset: "Headsets",
        feet: "Feet",
        chairs: "Cadeiras",
        monitors: "Monitores",
        switches: "Switches",
        dac_amp: "DAC/AMP",
      },
      descriptions: {
        mouse: "Navegue e compare os melhores mouses gamer para encontrar o ideal para o seu estilo de jogo. Formato, tamanho e peso impactam diretamente no conforto e precisão, enquanto métricas como sensor, DPI e polling rate determinam a acurácia em cada movimento.",
        keyboard: "Explore e compare teclados mecânicos, magnéticos e ópticos. O tipo de switch, layout e conectividade influenciam diretamente na experiência de digitação e performance em jogos competitivos.",
        pcb: "Compare PCBs avulsas para montar seu próprio teclado customizado. Layout, hot-swap e conectividade definem a base sobre a qual você escolhe plate, case e switches depois.",
        mousepad: "Compare mousepads de diferentes superfícies e tamanhos. A escolha da superfície, perfil e dimensões do pad afetam diretamente a velocidade, controle e precisão do seu mouse durante o jogo.",
        glasspad: "Explore glasspads superfícies de vidro de alto desempenho que oferecem deslizamento extremamente suave e durabilidade superior comparado aos mousepads convencionais.",
        headset: "Encontre o headset ideal para gaming e comunicação. Conectividade, qualidade de áudio e conforto são essenciais para longas sessões de jogo com máxima imersão sonora.",
        iem: "Compare IEMs (In-Ear Monitors) para jogos e áudio de alta qualidade. Drivers, resposta de frequência e isolamento passivo de ruído são fatores cruciais para uma experiência sonora precisa e imersiva.",
        dac_amp: "DACs e amplificadores para elevar a qualidade de áudio do seu setup. Essenciais para extrair o máximo de headsets e IEMs de alta impedância, garantindo fidelidade sonora excepcional.",
        feet: "Mouse feet determinam o deslizamento do seu mouse. Material, espessura e formato impactam na velocidade, controle e vida útil, alterando completamente a sensação do periférico.",
        chairs: "Cadeiras gamer e ergonômicas para longas sessões. Suporte lombar, ajuste de altura e material determinam o conforto e a saúde postural durante o jogo.",
        monitors: "Monitores para gaming com foco em taxa de atualização, tempo de resposta e tipo de painel. Encontre o monitor ideal para vantagem competitiva ou experiência visual premium em cada jogo.",
        switches: "Switches mecânicos, magnéticos e ópticos para teclados personalizados. Peso de atuação, sensação tátil e durabilidade influenciam na performance e preferência pessoal de cada jogador.",
      },
      others: "Outros",
      othersDescription: "Confira periféricos de outras categorias, como IEMs, DAC/AMP, glasspads, switches, feet e cadeiras.",
    },
    filters: {
      searchPeripherals: "Buscar periféricos",
      searchPlaceholder: "Buscar produtos, marcas, sensores...",
      filtersLabel: "Filtros",
      filterTierlist: "Filtrar Tierlist",
      filterDesc: "Preço, marca e opções específicas por categoria.",
      priceRange: "Faixa de Preço",
      mouseShape: "Shape do Mouse",
      keyboardLayout: "Layout do Teclado",
      clearFilters: (count: number) => `Limpar filtros (${count})`,
      itemCount: (count: number) => `${count} ${count === 1 ? "item" : "itens"} encontrados`,
      searchBadge: "Busca",
      allBrands: "Todas",
      searchBrand: "Buscar marca...",
      sortBy: "Ordenar por",
      recentlyAdded: "Recentes",
      bestRanked: "Melhor rankeado",
      nameAZ: "Nome A→Z",
      nameZA: "Nome Z→A",
      priceAsc: "Preço ↑",
      priceDesc: "Preço ↓",
      connectivity: "Conexão",
      shape: "Formato",
      weight: "Peso",
      surface: "Superfície",
      padType: "Tipo de Pad",
      refreshRate: "Taxa de Atualização",
      panelType: "Tipo de Painel",
      wired: "Com fio",
      wireless: "Sem fio",
      category: "Categoria",
      symmetrical: "Simétrico",
      ergonomic: "Ergonômico",
      mechanical: "Mecânico",
      magnetic: "Magnético",
      optical: "Óptico",
      cloth: "Tecido",
      glass: "Vidro",
      hybrid: "Híbrido",
      profile: "Perfil",
      brl: "Reais",
      searchNameBrand: "Nome, marca, sensor…",
      productCount: (count: number) => `${count} ${count === 1 ? "produto" : "produtos"}`,
      activeFilters: "filtro(s) ativo(s)",
      budgetBand: "Budget (até R$300)",
      golpeBand: "GOLPE",
      tags: "Tags",
    },
    tierlist: {
      info: "Informações da Tierlist",
      about: {
        title: "Sobre",
        p1: "A análise e ranqueamento dos periféricos é feita através de muitas horas de teste em uso e são baseados na minha opinião através disso",
        p2: "Talvez sua opinião seja diferente da minha e tudo bem, não tem problema se tu discordar do rank dado em alguns, temos opiniões distintas e respeito totalmente a sua opinião",
        p3: "Os periféricos são agrupados por Tier (Rank) e organizados por Categorias com foco em específicas áreas com determinado contexto",
      },
      categoriesTab: {
        title: "Categorias",
        p1: "Categorias são formas diferentes de se analisar os mesmo periféricos em contextos específicos",
        p2: "São bem auto explicativos, por exemplo, a categoria \"Custo Benefício\" foge do padrão de Tier: em vez de GOAT/SS/S/A..., os periféricos são agrupados por faixa de preço, mostrando os melhores de cada faixa",
      },
      tagsTab: {
        title: "Tags",
        p1: "Tags são etiquetas simples colocadas nos periféricos que visam descrever certos aspectos dele de forma breve, facilitando a busca dos interessados por outros periféricos que tenham essa determinada característica",
        p2: "Por exemplo; na Tag \"Competitivo\" entende-se que tal Periférico se destaca nesse campo competitivo, com tua função sendo focada nesse área em especifica e sendo uma escolha sólida caso tu procure por algo com esse enfoque",
      },
      tiers: {
        title: "Tiers",
        intro: "Tier ou Rank foi o formato escolhido para subdividir e organizar os periféricos. Baseado na cultura pop que se utiliza nos mangás para ranqueamento de heróis ou vilões.",
        goat: "GOAT - Os melhores sem sombra de dúvidas, praticamente perfeitos.",
        ss: "SS - Excepcional, quase perfeitos.",
        s: "S - Muito bons mas podem ter ressalvas.",
        a: "A - São bons mas com defeitos visíveis.",
        b: "B - São decentes, atendem o que se espera por eles.",
        c: "C - Usável, dá para usar tranquilo mas tem opções melhores.",
        l: "L - Veio Podi, não valem a pena, seus defeitos sobressaem as suas qualidades.",
        u: "U - Ultrapassados, não que eles sejam ruins mas estão ultrapassados, acaba não compensando pegar eles por justamente terem modelos mais recentes e atualizados.",
      },
      criteria: {
        title: "Criterios",
        intro: "A avaliação e ranqueamento se baseia:",
        item1: "Uso real em jogos no dia a dia",
        item2: "Latência e consistência nos jogos",
        item3: "Qualidade de construção e materiais",
        item4: "Recursos providos pela Marca",
      },
      latestUpdate: {
        title: "Ultima Atualizacao",
        dateFormat: "dd 'de' MMMM 'de' yyyy 'às' HH:mm",
        description: "As listas são atualizadas continuamente com novos lançamentos, revisões de firmware e mudanças de preço.",
      },
      viewingBy: "Voce esta vendo a tierlist ordenada por:",
      comingSoon: "Em Breve",
      comingSoonDesc: "Esta categoria de tierlist está em desenvolvimento e em breve estará disponível. Fique atento!",
      noItems: "Nenhum item encontrado com os filtros atuais.",
      underReview: "Sob Revisão",
      tierDescriptions: { GOAT: "Elite - Referencia absoluta", SS: "Extremo - Quase perfeito", S: "Top - Otima escolha", A: "Muito bom - Consistente e forte", B: "Bom - Opção sólida", C: "Ok - Funciona bem com limites", L: "Inferior - Apenas para casos específicos" },
      tierSubtitles: { GOAT: "Apelão", SS: "Excepcional", S: "Muito bom", A: "Bom", B: "Decente", C: "Usável", L: "Veio Podi" },
      modeDescriptions: { oled: "Mostrando painéis OLED", overall: "Ordenado por desempenho geral", value: "Agrupado por faixa de preço", soundTyping: "Ordenado por som e digitação", mechanical: "Ordenado por desempenho puro", magnetic: "Ordenado por desempenho magnético", pcb: "Ordenado por desempenho PCB", recommended: "Escolhas sugeridas por Sunano, priorizando equilibrio geral", ips_va: "Mostrando painéis IPS e VA", competitive: "Ordenado por desempenho competitivo" },
    },
    peripherals: {
      title: "Periféricos",
      subtitle: "Wiki pesquisável com filtros por categoria, marca e preço.",
      gamingGearDb: "Banco de Periféricos",
      findAndCompare: "Descubra e Compare",
      gamingPeripherals: "Periféricos Gamer",
      notFound: "Nenhum periférico encontrado.",
      adjustFilters: "Tente ajustar os filtros.",
      ranking: "Ranking",
      new: "Novo",
      searchNameBrand: "Nome, marca, sensor…",
      delete: {
        title: "Deletar Periférico?",
        aboutToDelete: "Você está prestes a deletar ",
        cannotUndo: "Esta ação não pode ser desfeita.",
        confirm: "Deletar",
        success: "Periférico deletado",
        error: "Erro ao deletar periférico",
        failed: "Erro ao deletar",
      },
    },
    admin: {
      sidebar: {
        general: "Geral",
        peripherals: "Periféricos",
        content: "Conteúdo",
        shop: "Loja",
        system: "Sistema",
        users: "Usuários",
        settings: "Configurações",
        offers: "Ofertas",
        storeAndBazar: "Loja & Bazar",
        newsAndReviews: "Notícias & Reviews",
        forum: "Fórum",
        actions: "Ações",
        viewSite: "Ver Site",
        signOut: "Sair",
      },
      dashboard: {
        title: "Dashboard",
        subtitle: "Visão geral do site e atalhos para o que você usa com mais frequência.",
        greetingMorning: "Bom dia",
        greetingAfternoon: "Boa tarde",
        greetingEvening: "Boa noite",
        liveLabel: "Dados em tempo real",
        overview: "Visão geral",
        quickActions: "Ações rápidas",
        needsAttention: "Precisa de atenção",
        allCaughtUp: "Tudo em dia por aqui.",
        statPeripherals: "Periféricos",
        statPeripheralsCaption: (count) => (count === 0 ? "tudo revisado" : `${count} pendente${count === 1 ? "" : "s"}`),
        statBlog: "Blog",
        statBlogCaption: (count) => `${count} rascunho${count === 1 ? "" : "s"}`,
        statForum: "Fórum",
        statForumCaption: (count) => `${count} oculto${count === 1 ? "" : "s"}`,
        statStore: "Loja & Bazar",
        statStoreCaption: (count) => (count === 0 ? "estoque ok" : `${count} sem estoque`),
        statOffers: "Ofertas",
        statOffersCaption: "últimos 30 dias",
        statBanners: "Banners",
        statBannersCaption: (active, max) => `${active}/${max} ativos`,
        statVisitorsCardTitle: "Visitantes",
        statVisitorsTabDay: "Dia",
        statVisitorsTabWeek: "Semana",
        statVisitorsTabMonth: "Mês",
        statVisitorsTabYear: "Ano",
        statVisitorsCaption: (period) =>
          period === "day"
            ? "visitantes hoje"
            : period === "week"
              ? "visitantes nos últimos 7 dias"
              : period === "month"
                ? "visitantes no mês"
                : "visitantes no ano",
        statVisitorsWeekOfMonth: (n) => `Sem ${n}`,
        statVisitorsEmpty: "Nenhuma visita registrada nesse período",
        performanceOverview: "Visão geral de performance",
        performanceCardTitle: "Atividade da comunidade",
        performanceTabToday: "Hoje",
        performanceTabWeek: "Semana",
        performanceInteractionsLabel: "novos posts e comentários",
        performanceAuraLabel: "de aura gerada no período",
        gaugeTitle: "Periféricos revisados",
        gaugeCaption: (approved, total) => `${approved} de ${total} aprovados`,
        gaugePendingLabel: (count) => `${count} pendente${count === 1 ? "" : "s"}`,
        gaugeEmptyLabel: "Nenhum periférico cadastrado",
        attentionPendingReview: (count) => `${count} periférico${count === 1 ? "" : "s"} pendente${count === 1 ? "" : "s"} de revisão`,
        attentionDrafts: (count) => `${count} rascunho${count === 1 ? "" : "s"} de blog aguardando publicação`,
        attentionOutOfStock: (count) => `${count} produto${count === 1 ? "" : "s"} fora de estoque`,
        actionNewPeripheral: "Novo periférico",
        actionOrganizeTierList: "Organizar Tier List",
        actionWritePost: "Escrever post",
        actionModerateForum: "Moderar fórum",
        actionViewOffers: "Ver ofertas",
        actionNewProduct: "Novo produto",
        actionBanners: "Banners da home",
        actionRanking: "Ranking",
        actionVideos: "Vídeos",
        actionUsers: "Usuários",
        actionSettings: "Configurações",
      },
      blog: {
        failedToLoad: "Erro ao carregar artigos",
        failedToDelete: "Erro ao deletar artigo",
        articleDeleted: "Artigo deletado",
        confirmDelete: "Tem certeza que deseja excluir este artigo?",
        published: "Publicados",
        draft: "Rascunho",
        drafts: "Rascunhos",
        news: "Notícias",
        reviews: "Reviews",
        newNews: "Nova notícia",
        newReview: "Novo review",
        nothingFound: "Nada encontrado",
        nothingYet: "Nada por aqui ainda",
        differentSearch: "Tente um termo diferente",
        createFirst: "Crie sua primeira publicação",
        postPublished: "Publicado",
        newsType: "Notícia",
        pageTitle: "Notícias & Reviews",
        pageDescription: "Gerencie notícias e reviews de periféricos.",
        items: (count: number, filtered: boolean) => `${count} item(ns)${filtered ? " · filtrado(s)" : ""}`,
        form: {
          editReview: "Editar review",
          editNews: "Editar notícia",
          newReview: "Novo review",
          newNews: "Nova notícia",
          reviewDesc: "Review vinculado a um periférico.",
          newsDesc: "Notícia / anúncio — sem periférico obrigatório.",
          failedToLoadPeripherals: "Erro ao carregar periféricos",
          failedToLoadArticle: "Erro ao carregar artigo",
          failedToUploadCover: "Erro ao enviar capa",
          failedToUploadThumbnail: "Erro ao enviar miniatura",
          failedToSave: "Erro ao salvar artigo",
          articleUpdated: "Artigo atualizado",
          articleCreated: "Artigo criado",
          articles: "Artigos",
          edit: "Editar",
          new: "Novo",
          contentType: "Tipo de conteúdo",
          newsType: "Notícia",
          newsTypeDesc: "Anúncio / editorial",
          reviewTypeDesc: "Vinculado a um periférico",
          titlePlaceholder: "Título do artigo...",
          chars: "caracteres",
          summaryLabel: "Resumo / excerpt",
          summaryPlaceholder: "Descrição curta exibida na listagem de artigos...",
          featuredLabel: "Destacar no header",
          featuredDesc: "Aparece como manchete grande no topo de /noticias (até 3 notícias)",
          featuredOn: "Destacada",
          featuredOff: "Não destacada",
          relatedPeripheral: "Periférico relacionado",
          change: "Trocar",
          searchBrandOrName: "Buscar por marca ou nome...",
          loadingPeripherals: "Carregando periféricos...",
          noPeripheralsFound: "Nenhum periférico encontrado",
          coverImages: "Imagens de capa",
          articleHeader: "Header do artigo",
          cardThumbnail: "Thumbnail do card",
          changeImage: "Trocar imagem",
          clickToUpload: "Clique para enviar",
          optionalAdapts: "Opcional — adapta do card se ausente",
          recommendedShown: "Recomendado — exibido na listagem",
          videoLink: "Link do vídeo (YouTube / Vimeo)",
          articleContent: "Conteúdo do artigo",
          contentPlaceholder: "Escreva o review ou artigo completo aqui...",
          publicationStatus: "Status de publicação",
          publishedLabel: "Publicado",
          draftLabel: "Rascunho",
          visibleToAll: "Visível para todos",
          visibleToAdmins: "Visível apenas para admins",
          uploadingHeader: "Enviando header...",
          uploadingThumbnail: "Enviando miniatura...",
          saving: "Salvando...",
          saveChanges: "Salvar alterações",
          publish: "Publicar",
          offerImage: "Imagem da oferta (banner)",
          offerPreview: "Preview da oferta",
          clickToUploadOffer: "Clique para enviar imagem da oferta",
          offerName: "Nome da Oferta",
          offerNameRequired: "Obrigatório. Entre 2 e 200 caracteres.",
          offerLink: "Link da Oferta",
          offerLinkRequired: "Obrigatório. URL completa começando com http:// ou https://",
          offerLinkFull: "URL completa começando com http:// ou https://",
          price: "Valor",
          currency: "Moeda",
          symbol: "Símbolo",
          linkedPeripheral: "Periférico Vinculado (Opcional)",
          selectPeripheral: "Selecione um periférico",
          noLinkedPeripheral: "Sem periférico vinculado",
          couponCode: "Código do Cupom (Opcional)",
          expirationDate: "Data de Expiração (Opcional)",
          cancel: "Cancelar",
          update: "Atualizar",
          create: "Criar",
          offer: "Oferta",
          failedToLoadPeripheralsOffer: "Erro ao carregar periféricos",
          failedToUploadOfferImage: "Erro ao enviar imagem da oferta",
          failedToSaveOffer: "Erro ao salvar oferta",
          offerUpdated: "Oferta atualizada",
          offerCreated: "Oferta criada",
          offerNameMin: "Obrigatório. Entre 2 e 200 caracteres.",
          priceGtZero: "Maior que zero.",
        },
      },
      users: {
        failedToLoad: "Erro ao carregar usuários",
        failedToSave: "Erro ao salvar",
        userUpdated: "Usuário atualizado",
        failedToSaveUser: "Erro ao salvar usuário",
        inviteSent: "Convite enviado",
        failedToCreate: "Erro ao criar",
        pageTitle: "Usuários e permissões",
        pageDescription: "Controle quem pode ler ou editar cada seção. WEB Master é sempre protegido.",
        webMasterOnly: "Apenas WEB Master",
        newUser: "Novo usuário",
        userCreated: "Usuário criado e convite enviado.",
        inviteNewUser: "Convidar novo usuário",
        displayName: "Nome",
        displayNamePlaceholder: "ex: Ana Souza",
        role: "Cargo",
        moderator: "Moderador",
        user: "Usuário",
        initialPermissions: "Permissões iniciais",
        sending: "Enviando...",
        sendInvite: "Enviar convite",
        noUsersFound: "Nenhum usuário encontrado.",
        read: "Leitura",
        edit: "Edição",
        saving: "Salvando...",
        save: "Salvar",
        cancel: "Cancelar",
        password: "Senha",
        locked: "Bloqueado",
        changePassword: "Alterar senha",
        newPasswordPlaceholder: "Nova senha (mín. 8 caracteres)",
        regularUserNote: "Usuário comum. Defina Moderador ou Admin para liberar as permissões do painel.",
        webMasterProtected: "As permissões do WEB Master são protegidas e não podem ser alteradas pelo painel.",
        makeWebMaster: (name: string) => `Tornar ${name} um WEB Master?`,
        makeWebMasterDesc: "Um WEB Master tem acesso total e irrestrito: pode gerenciar todos os usuários, cargos e permissões. É o nível mais alto e, uma vez concedido, a conta fica protegida — não poderá ser editada nem rebaixada por este painel.",
        confirmMakeWebMaster: "Sim, tornar WEB Master",
        failedToChangePassword: "Erro ao alterar senha",
        passwordChanged: "Senha alterada",
        failedToCreateUser: "Erro ao criar usuário",
        tier: "Tier",
        tierUpdated: "Tier atualizado",
        searchPlaceholder: "Buscar por nome ou email...",
        noResultsFiltered: "Nenhum usuário corresponde à busca.",
        statTotal: "Total",
        statWebMasters: "WEB Masters",
        statAdmins: "Admins",
        statModerators: "Moderadores",
        statRegular: "Comuns",
        deleteUser: "Excluir usuário",
        deleteUserTitle: (name: string) => `Excluir ${name} permanentemente?`,
        deleteUserDesc: "Esta ação é irreversível. A conta será removida do login, o perfil apagado e o histórico no fórum/loja anonimizado. A exclusão fica registrada no log de auditoria com o seu usuário como responsável.",
        deleteConfirmLabel: (email: string) => `Para confirmar, digite ${email} abaixo:`,
        confirmDelete: "Sim, excluir permanentemente",
        userDeleted: "Usuário excluído",
        failedToDelete: "Erro ao excluir usuário",
        cannotDeleteSelf: "Você não pode excluir a própria conta.",
        cannotDeleteWebMaster: "Uma conta WEB Master não pode ser excluída por este painel.",
        staffSectionTitle: "Staff - Sunano",
        membersSectionTitle: "Membros",
      },
      offers: {
        failedToLoad: "Erro ao carregar ofertas",
        pageTitle: "Ofertas",
        pageDescription: "Ofertas direto do grupo no Telegram.",
        telegramOffer: "Oferta Telegram",
        noMessages: "Nenhuma mensagem de oferta encontrada no Telegram.",
        openInTelegram: "Abrir no Telegram",
      },
      maintenance: {
        pageTitle: "Modo de manutenção do site",
        pageDescription: "Quando este modo estiver ativo, qualquer rota pública fica bloqueada e apenas usuários autenticados no admin continuam navegando.",
        currentStatus: "Status atual",
        stateFromEnv: "Estado lido diretamente da variavel de ambiente.",
        active: "ativo",
        inactive: "inativo",
        reopen: "Se precisar liberar o site, desative MAINTENANCE_MODE no deploy. Se quiser manter a administracao disponivel, o login continua acessivel em /admin/login.",
      },
      login: {
        title: "Entrar no admin",
        description: "Gerencie o site com segurança usando sua conta.",
        password: "Senha",
        yourPassword: "Sua senha",
        signIn: "Entrar",
        signingIn: "Entrando...",
        or: "ou",
        forgotPassword: "Esqueci minha senha",
        continueWithGoogle: "Continuar com Google",
        continueWithDiscord: "Continuar com Discord",
        passwordReset: "Redefinição de senha",
        passwordResetDesc: "Informe o email da sua conta e enviaremos um link para criar uma nova senha.",
        sendResetLink: "Enviar link de redefinição",
        sending: "Enviando...",
        resetSentIfRegistered: "Se o email estiver cadastrado, você receberá as instruções em breve.",
        backToLogin: "Voltar ao login",
        enterEmail: "Informe seu email.",
        enterValidEmail: "Informe um email válido.",
        errors: { missingCredentials: "Informe email e senha.", invalidCredentials: "Credenciais inválidas.", noAdminAccess: "Conta sem acesso ao admin." },
      },
      tierlistForm: {
        parentPeripherals: "Periféricos",
        parentTierlist: "Tierlist",
        headerEdit: "Editar Periférico",
        headerNew: "Novo Periférico",
        headerEditDesc: "Atualize as informações do periférico abaixo.",
        headerNewDesc: "Preencha os dados para adicionar um novo periférico à tierlist.",
        pickerSearchStore: "Buscar produto da Loja...",
        pickerSearchBazaar: "Buscar item do Bazar...",
        pickerTypeToFilter: "Digite para filtrar...",
        pickerClose: "Fechar",
        pickerLoading: "Carregando...",
        pickerNoItems: "Nenhum item encontrado.",
        failedLoadPeripheral: "Erro ao carregar periférico",
        selectTag: "Selecione uma tag",
        readOnlyBanner: "Modo somente leitura: você só tem permissão para visualizar periféricos, não para editá-los.",
        readOnlyNoPermission: "Você não tem permissão para editar periféricos.",
        failedUploadImage: "Erro ao enviar imagem",
        failedSave: "Erro ao salvar",
        updated: "Periférico atualizado",
        created: "Periférico criado",
        failedSaveLinked: "Erro ao salvar produtos vinculados",
        failedSavePeripheral: "Erro ao salvar periférico",
        failedRemoveBg: "Não foi possível remover o fundo automaticamente.",
        currentLoading: "Carregando...",
        currentEdit: "Editar",
        currentNew: "Novo",
        loadingPeripheral: "Carregando periférico...",
        loadingPeripheralDesc: "Buscando informações, imagem e especificações salvas.",
        sectionImage: "Imagem",
        clickChangeImage: "Clique para trocar a imagem",
        clickUploadImage: "Clique para enviar a imagem",
        removingBg: "Removendo fundo...",
        restoreOriginalBg: "Restaurar fundo original",
        removeBg: "Remover fundo",
        removeBgStrong: "Remoção mais forte",
        bgStrongHint: "Tenta preservar mais detalhe em fundos claros com pouco contraste (ex.: traços finos sobre fundo branco). Pode demorar um pouco mais.",
        bgRemovedAuto: "Fundo removido automaticamente.",
        bgBestWithSolid: "Funciona melhor com fundo sólido/branco.",
        sectionBasicInfo: "Informações Básicas",
        category: "Categoria",
        name: "Nome",
        charsHint: "Entre 1 e 200 caracteres",
        brand: "Marca",
        selectBrand: "Selecione uma marca",
        searchBrand: "Buscar marca...",
        brandHint: "Escolha uma das marcas da lista",
        priceUsd: "Preço (BRL)",
        tierHint: "Selecione o tier que melhor representa a performance deste periférico",
        underReview: "Sob Revisão",
        reviewCategoryLabel: "Frente de revisão",
        reviewCategoryHint: "Escolha a frente que ainda precisa de atenção neste periférico. Ele aparece na lista de revisão até ser marcado como aprovado.",
        reviewApprovedLabel: "Aprovado",
        reviewNotApprovedLabel: "Não aprovado",
        selectAtLeastOneTag: "Selecione pelo menos uma tag.",
        sectionRatings: "Notas (0–6)",
        sectionTechnicalSpecs: "Especificações Técnicas",
        sectionWikiContent: "Conteúdo da Wiki",
        sectionLinkedProducts: "Produtos Vinculados",
        linkedStoreProduct: "Produto da Loja vinculado",
        linkedBazaarItem: "Item do Bazar vinculado",
        sectionBuyLinks: "Links de Compra",
        cancel: "Cancelar",
        saving: "Salvando...",
        saveChanges: "Salvar alterações",
        createPeripheral: "Criar periférico",
      },
      tierlistPage: {
        newPeripheral: "Novo Periférico",
        dragAndDropHint: "Arraste e solte para reorganizar. Clique para editar.",
        orderUpdated: "Ordem atualizada",
        tierRemoved: "Tier removido",
        movedToTier: (tier: string) => `Movido para tier ${tier}`,
        failedToLoad: "Erro ao carregar",
        failedToLoadPeripherals: "Erro ao carregar periféricos",
        failedToUpdate: "Erro ao atualizar",
        failedToUpdateOrder: "Erro ao atualizar ordem",
        failedToUpdateOrderDesc: "Erro ao atualizar ordem dos periféricos",
        failedToUpdatePeripheral: "Erro ao atualizar periférico",
        underReviewPeripherals: "Periféricos Sob Revisão",
        dragToTierDesc: "Arraste para um tier para ranqueá-los",
        dropToRemoveDesc: "Solte um periférico aqui para remover o tier",
        releaseToRemove: "Solte para remover o tier",
        dropHereRemove: "Solte aqui para remover o tier",
        noUnassigned: "Nenhum periférico Sob Revisão",
        itemsCount: (count: number) => `${count} ${count === 1 ? "item" : "itens"}`,
        modeDescriptions: { performance: "Ordenado por desempenho puro", value: "Agrupado por faixa de preço", recommended: "Escolhas sugeridas por Sunano, priorizando equilibrio geral", oled: "Apenas painéis OLED", soundTyping: "Ordenado por som e digitação", mechanical: "Ordenado por desempenho puro", magnetic: "Ordenado por desempenho magnético", pcb: "Ordenado por desempenho PCB", ips_va: "Apenas painéis IPS e VA", competitive: "Ordenado por desempenho competitivo" },
      },
      tierlistReview: {
        pageTitle: "Revisão de Periféricos",
        pageDescription: "Escolha a frente que falta em cada periférico e aprove quando estiver pronto: Informações Técnicas (Performance), Loja, Vídeo review ou Specs e comentários.",
        backToDashboard: "Dashboard",
        failedToLoad: "Falha ao carregar os periféricos.",
        empty: "Nenhum periférico encontrado.",
        emptyDesc: "Tente ajustar sua busca.",
        searchPlaceholder: "Buscar por nome ou marca...",
        categoryPerformance: "Informações Técnicas (Performance)",
        categoryStore: "Loja",
        categoryVideoReview: "Vídeo review",
        categorySpecsComments: "Specs e comentários",
        filterAll: "Todos",
        approve: "Aprovar",
        approvedToast: "Periférico aprovado",
        updateFailed: "Falha ao atualizar periférico.",
        allApproved: "Tudo revisado!",
        allApprovedDesc: "Nenhum periférico pendente de aprovação.",
      },
    },
    settings: {
      title: "Configurações",
      subtitle: "Gerencie seu perfil e preferências do sistema.",
      adminProfile: "Perfil do admin",
      adminProfileDesc: "Seu nome e foto aparecem como autoria nos artigos do blog.",
      thisNameOnArticles: "Este nome aparece nos artigos publicados.",
      accountEmail: "Email da conta",
      cannotChange: "Não pode ser alterado aqui.",
      displayName: "Nome de exibição",
      displayNamePlaceholder: "ex: Pedro",
      preview: "Prévia: ",
      saving: "Salvando...",
      saveProfile: "Salvar perfil",
      profileSaved: "Perfil salvo",
      profileSavedDesc: "Perfil salvo com sucesso.",
      failedToSave: "Erro ao salvar perfil",
      failedToLoadProfile: "Erro ao carregar perfil",
      changePassword: "Alterar senha",
      exclusiveToWebmaster: "Exclusivo para o WEB Master.",
      newPassword: "Nova senha",
      minChars: "Mín. 8 caracteres",
      confirmPassword: "Confirmar senha",
      repeatPassword: "Repita a senha",
      passwordsDoNotMatch: "As senhas não conferem",
      passwordUpdatedSuccess: "Senha atualizada com sucesso.",
      updatePassword: "Atualizar senha",
      passwordUpdated: "Senha atualizada",
      failedToChangePassword: "Erro ao alterar senha",
      avatarUploaded: "Avatar enviado",
      failedToUploadAvatar: "Erro ao enviar avatar",
      passwordMin8: "A senha deve ter no mínimo 8 caracteres.",
      youtubeSync: "Sincronização YouTube",
      youtubeSyncDesc: "Snapshot diário usado na página pública de vídeos. Atualize manualmente se necessário.",
      available: "Disponível",
      notAvailable: "Indisponível",
      lastSync: "Última sync",
      moderator: "Moderador",
      youTubeSynced: "YouTube sincronizado",
      youTubeSnapshotRefreshed: "Snapshot do YouTube atualizado.",
      failedToRefresh: "Erro ao atualizar",
      failedToRefreshYoutube: "Erro ao atualizar YouTube",
      outdated: "Desatualizado",
      upToDate: "Atualizado",
      reloadStatus: "Recarregar status",
      refreshing: "Atualizando...",
      syncing: "Sincronizando...",
      forceRefresh: "Forçar atualização",
      failedToLoadProfileMsg: "Erro ao carregar perfil",
    },
    auth: {
      myProfile: "Meu Perfil",
      accountSettings: "Configurações da conta",
      adminPanel: "Painel admin",
      signOut: "Sair",
      settings: "Configurações",
    },
    blog: {
      title: "Guias",
      subtitle: "Guias completos para diversos assuntos, redigidos por especialistas do Sunano.",
      searchPlaceholder: "Buscar guias...",
      sortLabel: "Ordenar por",
      loading: "Carregando blog...",
      failedToLoad: "Erro ao carregar posts",
      articleOnBlog: "Artigo publicado no blog",
      tagBlog: "Blog",
      minRead: (count) => `${count} min de leitura`,
      noArticles: "Nenhum artigo encontrado.",
      comingSoon: "Novos guias serão publicados em breve.",
      articleNotFound: "Artigo não encontrado.",
      backToBlog: "Voltar ao blog",
      viewTierlist: "Ver tierlist",
      noPeripheral: "Sem periférico",
      by: "Por",
      relatedVideo: "Video relacionado",
      externalVideo: "Video externo:",
    },
    offers: {
      title: "Promoções",
      livePill: "Ao vivo · Sunano Telegram",
      disclaimer: "Mensagens publicadas por terceiros e podem mudar. Confirme os preços antes de comprar.",
      refresh: "Atualizar",
      join: "Entrar",
      telegramChannel: "Canal Telegram",
      noMessages: "Nenhuma mensagem encontrada",
      tryLater: "Tente novamente mais tarde.",
      new: "Novo",
      offerImage: "Imagem da oferta",
      openInTelegram: "Abrir no Telegram",
      failedToLoad: "Erro ao carregar ofertas",
      prev: "Ant.",
      next: "Próx.",
      dateFormat: "dd 'de' MMMM 'de' yyyy 'às' HH:mm",
    },
    maintenance: {
      mode: "Modo Manutenção",
      title: "Estamos ajustando o site",
      body1: "O conteúdo público está temporariamente indisponível enquanto realizamos melhorias.",
      body2: "Administradores autenticados continuam com acesso normal.",
      signInAsAdmin: "Entrar como admin",
      tryAgain: "Tentar novamente",
    },
    changelog: {
      title: "Changelog",
      description: "O histórico real de tudo que já foi construído, corrigido e melhorado no Sunano.",
      entries: [
        {
          version: "v0.2.9",
          date: "15 de agosto",
          title: "Reviews com estrelas nos periféricos, substituindo o BOM OU BAGRE",
          description: "A votação binária \"BOM OU BAGRE?\" saiu de cena — agora periféricos são avaliados com nota de 1 a 5 estrelas, e o veredito na página do produto passa a ser calculado pela média das avaliações da comunidade.",
          items: [
            "Nova aba \"Meus Reviews\" no perfil: avalie qualquer periférico do banco com nota (1 a 5 estrelas) e comentário opcional",
            "Termo de integridade: antes do primeiro review, é preciso aceitar que só avaliou o produto porque de fato o usou — quem for pego avaliando de achismo pode perder Aura e reviews removidos pela Staff",
            "Criar um review credita Aura pra você, com proteção contra farm de excluir e recriar a mesma review",
            "Página do periférico ganhou lista de reviews da comunidade, com nota, comentário, autor e badges de tier/ofensiva, priorizando quem tem mais Aura",
            "\"BOM OU BAGRE?\" deixou de ser voto binário e agora mostra o veredito calculado pela média das estrelas (bom, de bagre, ou empate)",
          ],
        },
        {
          version: "v0.2.8",
          date: "13 de agosto",
          title: "Comentários e votação nos periféricos, e faixa de preço na Tierlist",
          description: "Periféricos ganharam comentários e a votação \"BOM OU BAGRE?\", a página de cada Mouse foi reorganizada, e a Tierlist ganhou a faixa \"Custo Benefício\" por preço em vez de tier fixo.",
          items: [
            "Comentários nos periféricos: cada página de periférico agora tem uma seção de comentários (mesmo padrão de thread/Aura do Fórum) pra deixar experiência e opinião sobre o produto",
            "Votação \"BOM OU BAGRE?\": vote se recomenda ou não um periférico — a comunidade decide, e votar credita Aura pra você",
            "Página de Mouse reorganizada: \"Preço médio\" em destaque, especificações reordenadas (Latência, Switch, Sensor, Polling Rate, Coating, Trimode, Bateria, Autonomia), e novo bloco \"Shape\" com tamanho, dimensões e foto do formato",
            "Cards do banco de periféricos simplificados: só tags e preço em destaque, sem poluir com specs secundárias",
            "Tierlist: aba \"Custo Benefício\" agora agrupa por faixa de preço (Barato/Médio/Caro) em vez de tier fixo, com prioridade pra itens marcados como GOLPE",
            "Corrigido: a Tierlist perdia a aba selecionada ao voltar da página de detalhe de um periférico (resetava pra Teclado) — agora a aba fica salva e volta certinho",
            "Suporte a GIFs em comentários, além das imagens",
            "Upload de imagem de capa e miniatura nos posts do Blog",
            "Regras da comunidade atualizadas na barra lateral do Fórum",
          ],
        },
        {
          version: "v0.2.7 · Index Librorum Prohibitorum",
          date: "10 de agosto",
          title: "Filtro de conteúdo ofensivo, bônus de Aura da ofensiva e Changelog público",
          description: "Nome de exibição e bio passam por um filtro automático de termos ofensivos, a ofensiva diária agora rende um bônus percentual de Aura sobre tudo que você ganha, e o Changelog deixou de ser exclusivo de admin.",
          items: [
            "Nome de exibição e biografia do perfil são validados contra uma lista de termos ofensivos (baixo calão, discurso de ódio) no cadastro e na edição — quem já tinha um termo bloqueado no perfil foi censurado retroativamente com asteriscos e avisado pelo sino de notificações",
            "Bônus de Aura por ofensiva: cada dia seguido completando as 3 missões diárias aumenta um multiplicador percentual (de 1,1% a 6%) aplicado a todo ganho positivo de Aura — curtidas, missões, conquistas e criação de post/comentário",
            "Selo de ofensiva (perfil, mini-perfil, comentários e diretório) agora esquenta de âmbar para vermelho conforme os dias sobem, e mostra o bônus atual ao passar o mouse",
            "Nova aba 'Maiores Ofensivas' no Diretório de Pessoas, e as listas de ranking (Aura, Mais Ativos, Mais Visitados, Mais Seguidos) passaram a mostrar até 100 perfis",
            "Página /changelog deixou de ser restrita a administradores e agora aparece no menu para todo mundo",
            "Ícone de aura recebida nas notificações trocou de roxo para laranja (mesma cor da Aura no resto do site), e chamado de comentário/resposta não repete mais o texto da mensagem",
            "Termos de uso atualizados (versão 2026-08) com a regra sobre o filtro de conteúdo ofensivo",
          ],
        },
        {
          version: "v0.2.6",
          date: "9 de agosto",
          title: "Comentários com mais níveis de resposta e telas mais aproveitadas no celular",
          description: "Comentários agora suportam respostas aninhadas em mais níveis, e várias páginas ganharam ajustes de espaçamento e botões para caber melhor em telas pequenas.",
          items: [
            "Comentários agora aceitam até 4 níveis de resposta (antes só 1), com recuo decrescente para não espremer o texto em telas estreitas",
            "Posts ocultos do fórum não mostram mais os botões de Responder e Compartilhar, e os comentários exibem um aviso de que o post não aceita mais respostas",
            "Título de post do fórum agora quebra linha corretamente em vez de estourar o layout",
            "Botões de ação do fórum (Excluir, Ocultar/Mostrar, Compartilhar) viram ícone em telas pequenas para dar mais espaço ao conteúdo",
            "Menu de espaçamento das páginas principais ajustado para aproveitar melhor a tela no celular",
            "Botão 'Esqueceu a senha?' na tela de login reposicionado para ficar mais fácil de encontrar",
          ],
        },
        {
          version: "v0.2.5",
          date: "8 de agosto",
          title: "Conquistas, ofensiva diária e Eventos virou Conquistas",
          description: "Novo sistema de Conquistas com progressão por posts, comentários e seguidores, missões diárias com ofensiva (streak), e a página de Eventos foi unificada com as novas conquistas em /conquistas.",
          items: [
            "Conquistas por trilha (Posts, Comentários, Seguidores) com 5 níveis — Bronze, Prata, Ouro, Platina e Diamante",
            "Missões diárias (postar, comentar, dar aura) com badge própria na TopBar e painel de progresso",
            "Ofensiva (streak): completar as 3 missões do dia mantém a sequência viva, exibida com selo de pássaro na TopBar, no perfil, no mini-perfil e junto ao nome nos comentários",
            "Página /eventos virou /conquistas, reunindo eventos por tempo limitado e as novas conquistas gerais no mesmo lugar",
            "Medalhas do perfil agora mostram uma tag 'Evento' quando vieram de um evento, e a seção fica mais enxuta (sem contagem de slots)",
            "Menu do avatar no mobile ganhou tema, saldo de Aura e ofensiva, liberando espaço na barra superior para notificações e missões",
          ],
        },
        {
          version: "v0.2.4",
          date: "8 de agosto",
          title: "Menções e imagens nos comentários do Fórum.",
          description: "Agora dá pra marcar outras pessoas nos comentários com @ e anexar imagens direto na resposta, no fórum e no blog.",
          items: [
            "Menção a usuários com @ nos comentários, com autocompletar e notificação para quem foi marcado",
            "Upload de imagens nos comentários, com preview antes de enviar",
          ],
        },
        {
          version: "v0.2.3",
          date: "6 de agosto",
          title: "Aura de volta aos posts, exclusão de post/comentário e fórum mais social",
          description: "A Aura ganhou um botão de like direto nos posts do fórum, agora dá pra excluir seus próprios posts e comentários, e a barra lateral do fórum passou a mostrar quem está mais ativo e quem modera. Perfil e Diretório de Pessoas também tiveram ajustes.",
          items: [
            "Dar aura em posts: um like (sem dislike) credita +1 pro autor, com limite diário e sem poder reagir ao próprio post",
            "Exclusão do próprio post e do próprio comentário, direto pela interface",
            "Mini perfil ao passar o mouse sobre o nome/avatar de quem comentou, com link pro perfil",
            "Barra lateral do fórum ganhou cards de 'Mais Ativos' e 'Moderadores', além de uma descrição do fórum",
            "Card 'Em Alta' na Home, destacando o post com mais aura da semana",
            "Perfil: card de Posts e Comentários virou dois botões independentes, cada um abrindo o modal certo — o de Comentários lista os comentários do usuário com link pro post de cada um",
            "Diretório de Pessoas redesenhado: busca por nome removida, cada aba ganhou uma descrição, e o botão Seguir só aparece nas abas 'Mais visitados' e 'Seguindo'",
            "Página de periférico: quando o item é ranqueado em mais de um modo (ex.: mouse Geral/Magnético/Custo-Benefício), dá pra alternar entre eles direto na página",
            "Seletor de idioma saiu do topo do site — agora fica nas Preferências da conta",
          ],
        },
        {
          version: "v0.2.2",
          date: "5 de agosto",
          title: "Notificações, edição de comentários e ajustes na Aura",
          description: "Chegou o sino de notificações, comentários agora podem ser editados por um tempo, e a Aura ficou mais simples: reações vivem só nos comentários.",
          items: [
            "Notificações no sino do topo: aura recebida, comentários no seu post, respostas e novos seguidores",
            "Comentários podem ser editados por até 15 minutos após publicados, com suporte a negrito",
            "Reações (Like/Dislike) removidas dos posts — ficam só nos comentários, mantendo o foco da Aura em premiar quem posta",
            "Ajustes nos links de redes sociais e nas traduções da seção de vídeos",
          ],
        },
        {
          version: "v0.2.1",
          date: "5 de agosto",
          title: "Denúncias no fórum e SEO do site geral",
          description: "Fórum ganhou denúncia de post/comentário e visualização de imagem em tela cheia, e o site inteiro ganhou os fundamentos de SEO que faltavam para aparecer melhor no Google.",
          items: [
            "Denúncia de post e comentário no fórum, com fila de moderação para a equipe revisar",
            "Imagem do post agora abre em tela cheia, com zoom",
            "Borda do post fixado ficou mais nítida e simples",
            "SEO geral do site: metadados de compartilhamento (Open Graph/Twitter), dados estruturados ligando o Sunano ao canal do YouTube e redes sociais, e página inicial/tierlist/ranking/periféricos agora com título e descrição próprios",
          ],
        },
        {
          version: "v0.2.0",
          date: "5 de agosto",
          title: "SEO do fórum e do blog",
          description: "A partir desta versão o changelog passa a usar versionamento semântico (v0.2.0, v0.2.1...), com registro mais preciso do que muda em cada versão.",
          items: [
            "Posts do fórum renderizados no servidor, com metadata e dados estruturados (JSON-LD) para aparecer melhor no Google",
            "Páginas de categoria do fórum agora são indexáveis",
            "sitemap.xml e robots.txt novos, cobrindo fórum, blog e páginas estáticas",
          ],
        },
        {
          version: "Agosto 2026",
          date: "4 de agosto",
          title: "Aura rebalanceada e mais no Diretório de Pessoas",
          description: "Ajustes logo depois da fase Alpha: a Aura foi rebalanceada para premiar quem posta, reagir virou Like/Dislike e passou a existir só nos comentários, e o Diretório de Pessoas ficou mais completo.",
          items: [
            "Aura rebalanceada: postar dá +10 (1x por dia) e comentar dá +5 (1x por post)",
            "Reações trocadas por Like/Dislike (+1 e -1 de aura pro autor), agora só em comentários — post não recebe mais reação, quem posta é premiado por postar",
            "Aba Em Alta do fórum passou a ordenar pelos tópicos mais comentados",
            "Comentários das notícias/reviews do blog ganharam respostas em thread e reações, no mesmo padrão do fórum",
            "Diretório de Pessoas com ranking de atividade, e pódio com mini banner",
            "Ranking de Aura exibido também no perfil",
            "Resumo truncado com limite de caracteres no card de manchete das notícias",
            "Modo de avaliação padrão da tierlist agora se ajusta pela categoria selecionada",
          ],
        },
        {
          version: "Agosto 2026",
          date: "2 de agosto",
          title: "Sunano entra em fase Alpha",
          description: "O mês abriu com o lançamento oficial da fase Alpha do Sunano, com tag permanente no topo do site, e seguiu com novidades em eventos, fórum, perfis e segurança.",
          items: [
            "Lançamento da fase Alpha, com tag permanente no topo do site",
            'Eventos com resgate manual e resgatáveis com Aura, além de "Conquistas em destaque" na Home',
            "Sistema de auras (reações) e respostas em comentários no fórum, com menu de compartilhar nos posts",
            'Mini Perfil ao passar o cursor sobre avatares, Perfil com grade de estatísticas e enquadramento de foto/banner, badge "VIP+" e ranking "Mais Aura" no Diretório de Pessoas',
            'Segurança e LGPD: consentimento com auditoria, exclusão de conta por e-mail e "lembrar este dispositivo" no 2FA',
            'Nova categoria PCB e modos de classificação "IPS/VA" e "competitivo" na tierlist',
            "Ofertas do Telegram lidas direto do canal público, cadastro destravado e correções de login/uploads",
          ],
        },
        {
          version: "Julho 2026",
          date: "29 de julho",
          title: "Perfis sociais, curtidas e mais segurança",
          description: "O mês com mais mudanças até agora: recursos sociais novos, reforço de segurança e otimizações de performance em várias páginas.",
          items: [
            "Diretório de Pessoas com sistema de seguir outros membros",
            "Curtir/descurtir periféricos, com limite e persistência",
            "Vitrine de perfil público com medalhas e setup",
            "Banners configuráveis na Home",
            "Auditoria de segurança: políticas de acesso (RLS), rate limiting e proteção de uploads",
            "Nova página de acesso negado e permissões por seção no admin",
            "Home redesenhada com contadores animados",
            "Otimização do uso de transformação de imagens",
          ],
        },
        {
          version: "Junho 2026",
          date: "30 de junho",
          title: "Login social, 2FA e conformidade com a LGPD",
          description: "Mês focado em conta e segurança do usuário, além do lançamento da página de Ranking.",
          items: [
            "Login com Google e Discord",
            "Autenticação em duas etapas (2FA)",
            "Conformidade com a LGPD, incluindo exportação e anonimização de dados",
            "Recuperação e redefinição de senha",
            "Nova página de Ranking com pontuação por periférico",
            'Modo "Mecânico" na tierlist de teclados',
          ],
        },
        {
          version: "Maio 2026",
          date: "31 de maio",
          title: "Fórum, Loja & Bazar e reformulação visual",
          description: "O mês que trouxe as bases de várias seções que hoje sustentam o site.",
          items: [
            "Fórum da comunidade com posts e comentários",
            "Loja e Bazar de periféricos usados",
            "Sistema de tiers reformulado (GOAT, SS, S, A, B, C, L)",
            "Integração com Telegram para ofertas",
            "Tema escuro",
            "Reformulação completa da estrutura visual do site",
          ],
        },
        {
          version: "Abril 2026",
          date: "10 de abril",
          title: "O início do Sunano",
          description: "Primeira versão do site: uma tierlist de periféricos gamers com painel administrativo próprio.",
          items: [
            "Lançamento da tierlist de periféricos",
            "Painel administrativo",
            "Suporte a Português e Inglês",
            "Seção de vídeos do YouTube",
          ],
        },
      ],
    },
    errorPages: {
      notFoundTitle: "Essa página saiu voando do ninho",
      notFoundBody: "Cavamos em todo canto do site e não encontramos essa página. Talvez o link esteja errado ou ela tenha sido movida.",
      errorTitle: "Ops, alguma coisa quebrou",
      errorBody: "Nosso passarinho já tá correndo pra consertar. Tente de novo em alguns instantes.",
      errorDigest: (digest) => `Código do erro: ${digest}`,
      backHome: "Voltar para a Home",
      backDashboard: "Voltar ao Dashboard",
      goBack: "Voltar",
      tryAgain: "Tentar novamente",
      quickLinks: "Ou dá uma olhada em:",
      linkPeripherals: "Periféricos",
      linkTierlist: "Tierlist",
      linkBlog: "Blog & Reviews",
      linkForum: "Fórum",
    },
  },

  "en-US": {
    topbar: {
      languageLabel: "Language",
      languageHelper: "Choose the interface language",
      themeLabel: "Theme",
      themeHelper: "Pick a color mood",
    },
    notifications: {
      title: "Notifications",
      ariaLabel: "Notifications",
      empty: "Nothing here yet.",
      error: "Couldn't load your notifications.",
      dismiss: "Dismiss",
      unreadOne: "1 unread",
      unreadMany: "{count} unread",
      systemTitle: "System notice",
      auraFromActor: "{name} gave you +{amount} Aura",
      auraSelf: "You farmed +{amount} Aura",
      postComment: "{name} commented on your post",
      commentReply: "{name} replied to your comment",
      newFollower: "{name} started following you",
      mention: "{name} mentioned you in a comment",
      newPost: "{name} published a new post",
      loadMore: "Load more",
      loadingMore: "Loading...",
      clearAll: "Clear",
      clearAllConfirm: "Delete all notifications? This can't be undone.",
      clearing: "Clearing...",
      markRead: "Mark as read",
      markUnread: "Mark as unread",
      markAllRead: "Mark all as read",
    },
    nav: {
      home: "Home",
      peripherals: "Peripherals",
      content: "Community",
      shop: "Shop",
      news: "News",
      videos: "Videos & socials",
      forum: "Forum",
      store: "Store",
      market: "Market",
      used: "Used",
      offers: "Deals",
      people: "People",
      events: "Achievements",
    },
    common: {
      all: "All",
      allFem: "All",
      any: "Any",
      search: "Search",
      filters: "Filters",
      clear: "Clear",
      brand: "Brand",
      price: "Price",
      cancel: "Cancel",
      delete: "Delete",
      deleting: "Deleting...",
      edit: "Edit",
      new: "New",
      selected: "Selected",
      compare: "Compare",
      actions: "Actions",
      type: "Type",
      profile: "Profile",
      settings: "Settings",
      users: "Users",
      content: "Content",
      signOut: "Sign out",
    },
    categories: {
      labels: {
        keyboard: "Keyboards",
        pcb: "PCBs",
        mouse: "Mice",
        mousepad: "Mousepads",
        glasspad: "Glasspads",
        iem: "IEMs",
        headset: "Headsets",
        feet: "Mouse Feet",
        chairs: "Chairs",
        monitors: "Monitors",
        switches: "Switches",
        dac_amp: "DAC/AMP",
      },
      descriptions: {
        mouse: "Browse and compare the best gaming mice to find the ideal match for your play style. Shape, size, and weight directly impact comfort and precision, while performance metrics such as sensor, DPI and polling rate determine accuracy.",
        keyboard: "Explore and compare mechanical, magnetic and optical keyboards. Switch type, layout and connectivity directly influence your typing experience and performance in competitive gaming.",
        pcb: "Compare standalone PCBs for building your own custom keyboard. Layout, hot-swap and connectivity define the base you'll later pair with a plate, case and switches.",
        mousepad: "Compare mousepads with different surfaces and sizes. The choice of surface, profile and dimensions directly affect the speed, control and precision of your mouse during play.",
        glasspad: "Explore glasspads — high-performance glass surfaces that offer extremely smooth glide and superior durability compared to conventional mousepads.",
        headset: "Find the ideal headset for gaming and communication. Connectivity, audio quality and comfort are essential for long gaming sessions with maximum immersion.",
        iem: "Compare IEMs (In-Ear Monitors) for gaming and high-quality audio. Drivers, frequency response and passive noise isolation are crucial factors for a precise and immersive sound experience.",
        dac_amp: "DACs and amplifiers to elevate the audio quality of your setup. Essential for getting the most out of high-impedance headsets and IEMs, ensuring exceptional sound fidelity.",
        feet: "Mouse feet determine how your mouse glides. Material, thickness and shape directly impact speed, control and pad lifespan, completely changing the feel of your peripheral.",
        chairs: "Gaming and ergonomic chairs for long sessions. Lumbar support, height adjustment and material determine comfort and postural health during gaming.",
        monitors: "Gaming monitors focused on refresh rate, response time and panel type. Find the ideal monitor for competitive advantage or premium visual experience in every game.",
        switches: "Mechanical, magnetic and optical switches for custom keyboards. Actuation force, tactile feel and durability influence performance and each player's personal preference.",
      },
      others: "Others",
      othersDescription: "Check out peripherals from other categories, such as IEMs, DAC/AMP, glasspads, switches, feet and chairs.",
    },
    filters: {
      searchPeripherals: "Search peripherals",
      searchPlaceholder: "Search products, brands, sensors...",
      filtersLabel: "Filters",
      filterTierlist: "Filter Tierlist",
      filterDesc: "Price, brand, and category-specific options.",
      priceRange: "Price Range",
      mouseShape: "Mouse Shape",
      keyboardLayout: "Keyboard Layout",
      clearFilters: (count: number) => `Clear filters (${count})`,
      itemCount: (count: number) => `${count} ${count === 1 ? "item" : "items"} found`,
      searchBadge: "Search",
      allBrands: "All brands",
      searchBrand: "Search brand...",
      sortBy: "Sort by",
      recentlyAdded: "Recently added",
      bestRanked: "Best ranked",
      nameAZ: "Name A→Z",
      nameZA: "Name Z→A",
      priceAsc: "Price ↑",
      priceDesc: "Price ↓",
      connectivity: "Connectivity",
      shape: "Shape",
      weight: "Weight",
      surface: "Surface",
      padType: "Pad Type",
      refreshRate: "Refresh Rate",
      panelType: "Panel Type",
      wired: "Wired",
      wireless: "Wireless",
      category: "Category",
      symmetrical: "Symmetrical",
      ergonomic: "Ergonomic",
      mechanical: "Mechanical",
      magnetic: "Magnetic",
      optical: "Optical",
      cloth: "Cloth",
      glass: "Glass",
      hybrid: "Hybrid",
      profile: "Profile",
      brl: "BRL",
      searchNameBrand: "Name, brand, sensor…",
      productCount: (count: number) => `${count} ${count === 1 ? "product" : "products"}`,
      activeFilters: "filter(s) active",
      budgetBand: "Budget (up to R$300)",
      golpeBand: "GOLPE",
      tags: "Tags",
    },
    tierlist: {
      info: "Tierlist Information",
      about: {
        title: "About",
        p1: "The analysis and ranking of peripherals comes from many hours of real usage testing and reflects my own opinion.",
        p2: "Your opinion might differ from mine, and that's completely fine — it's okay to disagree with the rank given to some items. We have different opinions, and I fully respect yours.",
        p3: "Peripherals are grouped by Tier (Rank) and organized by Categories focused on specific areas with a given context.",
      },
      categoriesTab: {
        title: "Categories",
        p1: "Categories are different ways of analyzing the same peripherals within specific contexts.",
        p2: "They're pretty self-explanatory — for example, the \"Cost-Benefit\" category breaks from the Tier pattern: instead of GOAT/SS/S/A..., peripherals are grouped by price range, showing the best of each range.",
      },
      tagsTab: {
        title: "Tags",
        p1: "Tags are simple labels placed on peripherals to briefly describe certain aspects of them, making it easier for interested users to find other peripherals that share that particular trait.",
        p2: "For example, the \"Competitive\" tag means that peripheral stands out in the competitive field, with its role focused specifically on that area — making it a solid choice if you're looking for something with that focus.",
      },
      tiers: {
        title: "Tiers",
        intro: "Tier (or Rank) is the format chosen to break down and organize the peripherals, based on the pop-culture style used in mangas to rank heroes and villains.",
        goat: "GOAT — The best, without a doubt, practically perfect.",
        ss: "SS — Exceptional, nearly perfect.",
        s: "S — Very good, but may have some caveats.",
        a: "A — Good, but with visible flaws.",
        b: "B — Decent, meets what's expected of them.",
        c: "C — Usable, fine to go with, but better options exist.",
        l: "L — Veio Podi, not worth it — their flaws outweigh their qualities.",
        u: "U — Outdated. Not that they're bad, but they're outdated — not worth getting since newer, more up-to-date models exist.",
      },
      criteria: {
        title: "Criteria",
        intro: "The evaluation and ranking is based on:",
        item1: "Real usage in games and day-to-day",
        item2: "Latency and consistency in games",
        item3: "Build quality and materials",
        item4: "Features provided by the brand",
      },
      latestUpdate: {
        title: "Latest Update",
        dateFormat: "MMMM dd, yyyy 'at' HH:mm",
        description: "Lists are updated continuously based on new releases, firmware revisions, and market price changes.",
      },
      viewingBy: "You are viewing the tierlist sorted by:",
      comingSoon: "Coming Soon",
      comingSoonDesc: "This tierlist category is under development and will be available soon. Stay tuned!",
      noItems: "No items found with the current filters.",
      underReview: "Under Review",
      tierDescriptions: { GOAT: "Elite - Absolute reference", SS: "Extreme - Almost perfect", S: "Top - Great choice", A: "Very good - Strong and consistent", B: "Good - Solid option", C: "Okay - Works well with tradeoffs", L: "Lower - Only for niche cases" },
      tierSubtitles: { GOAT: "", SS: "", S: "", A: "", B: "", C: "", L: "" },
      modeDescriptions: { oled: "Showing OLED panels", overall: "Sorted by overall performance", value: "Grouped by price range", soundTyping: "Sorted by sound and typing feel", mechanical: "Sorted by mechanical performance", magnetic: "Sorted by magnetic performance", pcb: "Sorted by PCB performance", recommended: "Suggested picks by Sunano, prioritizing overall balance", ips_va: "Showing IPS and VA panels", competitive: "Sorted by competitive performance" },
    },
    peripherals: {
      title: "Peripherals",
      subtitle: "A searchable wiki with filters by category, brand and price.",
      gamingGearDb: "Gaming Gear Database",
      findAndCompare: "Find and Compare",
      gamingPeripherals: "Gaming Peripherals",
      notFound: "No peripherals found.",
      adjustFilters: "Try adjusting your filters.",
      ranking: "Ranking",
      new: "New",
      searchNameBrand: "Name, brand, sensor…",
      delete: {
        title: "Delete Peripheral?",
        aboutToDelete: "You are about to delete ",
        cannotUndo: "This action cannot be undone.",
        confirm: "Delete",
        success: "Peripheral deleted",
        error: "Failed to delete peripheral",
        failed: "Failed to delete",
      },
    },
    admin: {
      sidebar: {
        general: "General",
        peripherals: "Peripherals",
        content: "Content",
        shop: "Shop",
        system: "System",
        users: "Users",
        settings: "Settings",
        offers: "Offers",
        storeAndBazar: "Store & Bazar",
        newsAndReviews: "News & Reviews",
        forum: "Forum",
        actions: "Actions",
        viewSite: "View Site",
        signOut: "Sign out",
      },
      dashboard: {
        title: "Dashboard",
        subtitle: "Site overview and shortcuts to what you use most.",
        greetingMorning: "Good morning",
        greetingAfternoon: "Good afternoon",
        greetingEvening: "Good evening",
        liveLabel: "Live data",
        overview: "Overview",
        quickActions: "Quick actions",
        needsAttention: "Needs attention",
        allCaughtUp: "All caught up here.",
        statPeripherals: "Peripherals",
        statPeripheralsCaption: (count) => (count === 0 ? "all reviewed" : `${count} pending`),
        statBlog: "Blog",
        statBlogCaption: (count) => `${count} draft${count === 1 ? "" : "s"}`,
        statForum: "Forum",
        statForumCaption: (count) => `${count} hidden`,
        statStore: "Store & Bazaar",
        statStoreCaption: (count) => (count === 0 ? "stock ok" : `${count} out of stock`),
        statOffers: "Offers",
        statOffersCaption: "last 30 days",
        statBanners: "Banners",
        statBannersCaption: (active, max) => `${active}/${max} active`,
        statVisitorsCardTitle: "Visitors",
        statVisitorsTabDay: "Day",
        statVisitorsTabWeek: "Week",
        statVisitorsTabMonth: "Month",
        statVisitorsTabYear: "Year",
        statVisitorsCaption: (period) =>
          period === "day"
            ? "visitors today"
            : period === "week"
              ? "visitors in the last 7 days"
              : period === "month"
                ? "visitors this month"
                : "visitors this year",
        statVisitorsWeekOfMonth: (n) => `Wk ${n}`,
        statVisitorsEmpty: "No visits recorded in this period",
        performanceOverview: "Performance overview",
        performanceCardTitle: "Community activity",
        performanceTabToday: "Today",
        performanceTabWeek: "Week",
        performanceInteractionsLabel: "new posts and comments",
        performanceAuraLabel: "aura earned in the period",
        gaugeTitle: "Peripherals reviewed",
        gaugeCaption: (approved, total) => `${approved} of ${total} approved`,
        gaugePendingLabel: (count) => `${count} pending`,
        gaugeEmptyLabel: "No peripherals yet",
        attentionPendingReview: (count) => `${count} peripheral${count === 1 ? "" : "s"} pending review`,
        attentionDrafts: (count) => `${count} blog draft${count === 1 ? "" : "s"} awaiting publish`,
        attentionOutOfStock: (count) => `${count} product${count === 1 ? "" : "s"} out of stock`,
        actionNewPeripheral: "New peripheral",
        actionOrganizeTierList: "Organize Tier List",
        actionWritePost: "Write post",
        actionModerateForum: "Moderate forum",
        actionViewOffers: "View offers",
        actionNewProduct: "New product",
        actionBanners: "Home banners",
        actionRanking: "Ranking",
        actionVideos: "Videos",
        actionUsers: "Users",
        actionSettings: "Settings",
      },
      blog: {
        failedToLoad: "Failed to load articles",
        failedToDelete: "Failed to delete article",
        articleDeleted: "Article deleted",
        confirmDelete: "Are you sure you want to delete this article?",
        published: "Published",
        draft: "Draft",
        drafts: "Drafts",
        news: "News",
        reviews: "Reviews",
        newNews: "New news",
        newReview: "New review",
        nothingFound: "Nothing found",
        nothingYet: "Nothing here yet",
        differentSearch: "Try a different search term",
        createFirst: "Create your first post",
        postPublished: "Published",
        newsType: "News",
        pageTitle: "News & Reviews",
        pageDescription: "Manage news posts and peripheral reviews.",
        items: (count: number, filtered: boolean) => `${count} item(s)${filtered ? " · filtered" : ""}`,
        form: {
          editReview: "Edit review",
          editNews: "Edit news",
          newReview: "New review",
          newNews: "New news",
          reviewDesc: "Review linked to a peripheral.",
          newsDesc: "News / announcement — no peripheral required.",
          failedToLoadPeripherals: "Failed to load peripherals",
          failedToLoadArticle: "Failed to load article",
          failedToUploadCover: "Failed to upload cover",
          failedToUploadThumbnail: "Failed to upload thumbnail",
          failedToSave: "Failed to save article",
          articleUpdated: "Article updated",
          articleCreated: "Article created",
          articles: "Articles",
          edit: "Edit",
          new: "New",
          contentType: "Content type",
          newsType: "News",
          newsTypeDesc: "Announcement / editorial",
          reviewTypeDesc: "Linked to a peripheral",
          titlePlaceholder: "Article title...",
          chars: "chars",
          summaryLabel: "Summary / excerpt",
          summaryPlaceholder: "Short description shown in article listings...",
          featuredLabel: "Feature in header",
          featuredDesc: "Shows as a large headline at the top of /noticias (up to 3 news items)",
          featuredOn: "Featured",
          featuredOff: "Not featured",
          relatedPeripheral: "Related peripheral",
          change: "Change",
          searchBrandOrName: "Search by brand or name...",
          loadingPeripherals: "Loading peripherals...",
          noPeripheralsFound: "No peripherals found",
          coverImages: "Cover images",
          articleHeader: "Article header",
          cardThumbnail: "Card thumbnail",
          changeImage: "Change image",
          clickToUpload: "Click to upload",
          optionalAdapts: "Optional — adapts from card if missing",
          recommendedShown: "Recommended — shown in article listing",
          videoLink: "Video link (YouTube / Vimeo)",
          articleContent: "Article content",
          contentPlaceholder: "Write the full review or article here...",
          publicationStatus: "Publication status",
          publishedLabel: "Published",
          draftLabel: "Draft",
          visibleToAll: "Visible to everyone",
          visibleToAdmins: "Only visible to admins",
          uploadingHeader: "Uploading header...",
          uploadingThumbnail: "Uploading thumbnail...",
          saving: "Saving...",
          saveChanges: "Save changes",
          publish: "Publish",
          offerImage: "Offer image (banner)",
          offerPreview: "Offer preview",
          clickToUploadOffer: "Click to upload offer image",
          offerName: "Offer Name",
          offerNameRequired: "Required. 2–200 characters.",
          offerLink: "Offer Link",
          offerLinkRequired: "Required. Full URL starting with http:// or https://",
          offerLinkFull: "Full URL starting with http:// or https://",
          price: "Price",
          currency: "Currency",
          symbol: "Symbol",
          linkedPeripheral: "Linked Peripheral (Optional)",
          selectPeripheral: "Select a peripheral",
          noLinkedPeripheral: "No linked peripheral",
          couponCode: "Coupon Code (Optional)",
          expirationDate: "Expiration Date (Optional)",
          cancel: "Cancel",
          update: "Update",
          create: "Create",
          offer: "Offer",
          failedToLoadPeripheralsOffer: "Failed to load peripherals",
          failedToUploadOfferImage: "Failed to upload offer image",
          failedToSaveOffer: "Failed to save offer",
          offerUpdated: "Offer updated",
          offerCreated: "Offer created",
          offerNameMin: "Required. 2–200 characters.",
          priceGtZero: "Greater than 0.",
        },
      },
      users: {
        failedToLoad: "Failed to load users",
        failedToSave: "Failed to save",
        userUpdated: "User updated",
        failedToSaveUser: "Failed to save user",
        inviteSent: "Invite sent",
        failedToCreate: "Failed to create",
        pageTitle: "Users & permissions",
        pageDescription: "Control who can read or edit each section. WEB Master is always protected.",
        webMasterOnly: "WEB Master only",
        newUser: "New user",
        userCreated: "User created and invite sent.",
        inviteNewUser: "Invite new user",
        displayName: "Display name",
        displayNamePlaceholder: "e.g. Ana Souza",
        role: "Role",
        moderator: "Moderator",
        user: "User",
        initialPermissions: "Initial permissions",
        sending: "Sending...",
        sendInvite: "Send invite",
        noUsersFound: "No users found.",
        read: "Read",
        edit: "Edit",
        saving: "Saving...",
        save: "Save",
        cancel: "Cancel",
        password: "Password",
        locked: "Locked",
        changePassword: "Change password",
        newPasswordPlaceholder: "New password (min. 8 chars)",
        regularUserNote: "Regular user. Assign Moderator or Admin to grant panel permissions.",
        webMasterProtected: "WEB Master permissions are protected and cannot be changed from the panel.",
        makeWebMaster: (name: string) => `Make ${name} a WEB Master?`,
        makeWebMasterDesc: "A WEB Master has full, unrestricted access: they can manage all users, roles and permissions. It is the highest level and, once granted, the account becomes protected — it cannot be edited or demoted from this panel.",
        confirmMakeWebMaster: "Yes, make WEB Master",
        failedToChangePassword: "Failed to change password",
        passwordChanged: "Password changed",
        failedToCreateUser: "Failed to create user",
        tier: "Tier",
        tierUpdated: "Tier updated",
        searchPlaceholder: "Search by name or email...",
        noResultsFiltered: "No users match your search.",
        statTotal: "Total",
        statWebMasters: "WEB Masters",
        statAdmins: "Admins",
        statModerators: "Moderators",
        statRegular: "Regular",
        deleteUser: "Delete user",
        deleteUserTitle: (name: string) => `Permanently delete ${name}?`,
        deleteUserDesc: "This action cannot be undone. The account will be removed from login, the profile deleted, and forum/store history anonymized. The deletion is logged in the audit trail with your user as the actor.",
        deleteConfirmLabel: (email: string) => `To confirm, type ${email} below:`,
        confirmDelete: "Yes, delete permanently",
        userDeleted: "User deleted",
        failedToDelete: "Failed to delete user",
        cannotDeleteSelf: "You cannot delete your own account.",
        cannotDeleteWebMaster: "A WEB Master account cannot be deleted from this panel.",
        staffSectionTitle: "Staff - Sunano",
        membersSectionTitle: "Members",
      },
      offers: {
        failedToLoad: "Failed to load offers",
        pageTitle: "Offers",
        pageDescription: "Offers synced directly from Telegram group messages.",
        telegramOffer: "Telegram Offer",
        noMessages: "No Telegram messages found for offers.",
        openInTelegram: "Open in Telegram",
      },
      maintenance: {
        pageTitle: "Website maintenance mode",
        pageDescription: "When this mode is active, public routes are blocked and only authenticated admin users can keep navigating.",
        currentStatus: "Current status",
        stateFromEnv: "State read directly from environment variable.",
        active: "active",
        inactive: "inactive",
        reopen: "If you need to reopen the site, disable MAINTENANCE_MODE on deploy. To keep administration available, login stays accessible at /admin/login.",
      },
      tierlistForm: {
        parentPeripherals: "Peripherals",
        parentTierlist: "Tierlist",
        headerEdit: "Edit Peripheral",
        headerNew: "New Peripheral",
        headerEditDesc: "Update the peripheral information below.",
        headerNewDesc: "Fill in the details to add a new peripheral to the tierlist.",
        pickerSearchStore: "Search a store product...",
        pickerSearchBazaar: "Search a bazaar item...",
        pickerTypeToFilter: "Type to filter...",
        pickerClose: "Close",
        pickerLoading: "Loading...",
        pickerNoItems: "No items found.",
        failedLoadPeripheral: "Failed to load peripheral",
        selectTag: "Select a tag",
        readOnlyBanner: "Read-only mode: you only have permission to view peripherals, not edit them.",
        readOnlyNoPermission: "You don't have permission to edit peripherals.",
        failedUploadImage: "Failed to upload image",
        failedSave: "Failed to save",
        updated: "Peripheral updated",
        created: "Peripheral created",
        failedSaveLinked: "Failed to save linked products",
        failedSavePeripheral: "Failed to save peripheral",
        failedRemoveBg: "Couldn't remove the background automatically.",
        currentLoading: "Loading...",
        currentEdit: "Edit",
        currentNew: "New",
        loadingPeripheral: "Loading peripheral...",
        loadingPeripheralDesc: "Fetching saved info, image and specs.",
        sectionImage: "Image",
        clickChangeImage: "Click to change image",
        clickUploadImage: "Click to upload image",
        removingBg: "Removing background...",
        restoreOriginalBg: "Restore original background",
        removeBg: "Remove background",
        removeBgStrong: "Stronger removal",
        bgStrongHint: "Tries to preserve more detail on light, low-contrast backgrounds (e.g. thin strokes on white). May take a bit longer.",
        bgRemovedAuto: "Background removed automatically.",
        bgBestWithSolid: "Works best with solid/white backgrounds.",
        sectionBasicInfo: "Basic Info",
        category: "Category",
        name: "Name",
        charsHint: "1-200 characters",
        brand: "Brand",
        selectBrand: "Select a brand",
        searchBrand: "Search brand...",
        brandHint: "Pick from the list above",
        priceUsd: "Price (BRL)",
        tierHint: "Select the tier that best represents this peripheral's performance",
        underReview: "Under Review",
        reviewCategoryLabel: "Review focus",
        reviewCategoryHint: "Pick the area that still needs attention on this peripheral. It stays in the review list until marked approved.",
        reviewApprovedLabel: "Approved",
        reviewNotApprovedLabel: "Not approved",
        selectAtLeastOneTag: "Select at least one tag.",
        sectionRatings: "Ratings (0-6)",
        sectionTechnicalSpecs: "Technical Specs",
        sectionWikiContent: "Wiki Content",
        sectionLinkedProducts: "Linked Products",
        linkedStoreProduct: "Linked Loja product",
        linkedBazaarItem: "Linked Bazar item",
        sectionBuyLinks: "Buy Links",
        cancel: "Cancel",
        saving: "Saving...",
        saveChanges: "Save changes",
        createPeripheral: "Create peripheral",
      },
      login: {
        title: "Sign in to admin",
        description: "Manage the website securely with your account.",
        password: "Password",
        yourPassword: "Your password",
        signIn: "Sign in",
        signingIn: "Signing in...",
        or: "or",
        forgotPassword: "Forgot my password",
        continueWithGoogle: "Continue with Google",
        continueWithDiscord: "Continue with Discord",
        passwordReset: "Password reset",
        passwordResetDesc: "Enter your account email and we'll send a reset link.",
        sendResetLink: "Send reset link",
        sending: "Sending...",
        resetSentIfRegistered: "If the email is registered, you will receive the reset instructions shortly.",
        backToLogin: "Back to login",
        enterEmail: "Enter your email.",
        enterValidEmail: "Enter a valid email.",
        errors: { missingCredentials: "Enter email and password.", invalidCredentials: "Invalid credentials.", noAdminAccess: "Account has no admin access." },
      },
      tierlistPage: {
        newPeripheral: "New Peripheral",
        dragAndDropHint: "Drag and drop to reorder. Click to edit.",
        orderUpdated: "Order updated",
        tierRemoved: "Tier removed",
        movedToTier: (tier: string) => `Moved to tier ${tier}`,
        failedToLoad: "Failed to load",
        failedToLoadPeripherals: "Failed to load peripherals",
        failedToUpdate: "Failed to update",
        failedToUpdateOrder: "Failed to update order",
        failedToUpdateOrderDesc: "Failed to update peripheral order",
        failedToUpdatePeripheral: "Failed to update peripheral",
        underReviewPeripherals: "Under Review peripherals",
        dragToTierDesc: "Drag to a tier row to rank them",
        dropToRemoveDesc: "Drop a peripheral here to remove its tier",
        releaseToRemove: "Release to remove tier",
        dropHereRemove: "Drop here to remove tier",
        noUnassigned: "No peripherals without tier",
        itemsCount: (count: number) => `${count} ${count === 1 ? "item" : "items"}`,
        modeDescriptions: { performance: "Sorted by pure performance", value: "Grouped by price range", recommended: "Suggested picks by Sunano, prioritizing overall balance", oled: "Show only OLED panels", soundTyping: "Sorted by sound and typing feel", mechanical: "Sorted by mechanical performance", magnetic: "Sorted by magnetic performance", pcb: "Sorted by PCB performance", ips_va: "Show only IPS and VA panels", competitive: "Sorted by competitive performance" },
      },
      tierlistReview: {
        pageTitle: "Peripheral Review",
        pageDescription: "Pick the focus area for each peripheral and approve it once it's ready: Technical Info (Performance), Store, Video review, or Specs & comments.",
        backToDashboard: "Dashboard",
        failedToLoad: "Failed to load peripherals.",
        empty: "No peripherals found.",
        emptyDesc: "Try adjusting your search.",
        searchPlaceholder: "Search by name or brand...",
        categoryPerformance: "Technical Info (Performance)",
        categoryStore: "Store",
        categoryVideoReview: "Video review",
        categorySpecsComments: "Specs & comments",
        filterAll: "All",
        approve: "Approve",
        approvedToast: "Peripheral approved",
        updateFailed: "Failed to update peripheral.",
        allApproved: "All caught up!",
        allApprovedDesc: "No peripherals pending approval.",
      },
    },
    settings: {
      title: "Settings",
      subtitle: "Manage your profile and system preferences.",
      adminProfile: "Admin profile",
      adminProfileDesc: "Your name and photo appear as authorship on blog articles.",
      thisNameOnArticles: "This name appears on published articles.",
      accountEmail: "Account email",
      cannotChange: "Cannot be changed here.",
      displayName: "Display name",
      displayNamePlaceholder: "e.g. Pedro",
      preview: "Preview: ",
      saving: "Saving...",
      saveProfile: "Save profile",
      profileSaved: "Profile saved",
      profileSavedDesc: "Profile saved successfully.",
      failedToSave: "Failed to save profile",
      failedToLoadProfile: "Failed to load profile",
      changePassword: "Change password",
      exclusiveToWebmaster: "Exclusive to WEB Master.",
      newPassword: "New password",
      minChars: "Min. 8 characters",
      confirmPassword: "Confirm password",
      repeatPassword: "Repeat the password",
      passwordsDoNotMatch: "Passwords do not match",
      passwordUpdatedSuccess: "Password updated successfully.",
      updatePassword: "Update password",
      passwordUpdated: "Password updated",
      failedToChangePassword: "Failed to change password",
      avatarUploaded: "Avatar uploaded",
      failedToUploadAvatar: "Failed to upload avatar",
      passwordMin8: "Password must be at least 8 characters.",
      youtubeSync: "YouTube sync",
      youtubeSyncDesc: "Daily snapshot used on the public videos page. Refresh manually if needed.",
      available: "Available",
      notAvailable: "Not available",
      lastSync: "Last sync",
      moderator: "Moderator",
      youTubeSynced: "YouTube synced",
      youTubeSnapshotRefreshed: "YouTube snapshot refreshed.",
      failedToRefresh: "Failed to refresh",
      failedToRefreshYoutube: "Failed to refresh YouTube",
      outdated: "Outdated",
      upToDate: "Up to date",
      reloadStatus: "Reload status",
      refreshing: "Refreshing...",
      syncing: "Syncing...",
      forceRefresh: "Force refresh",
      failedToLoadProfileMsg: "Failed to load profile",
    },
    auth: {
      myProfile: "My Profile",
      accountSettings: "Account settings",
      adminPanel: "Admin panel",
      signOut: "Sign out",
      settings: "Settings",
    },
    blog: {
      title: "Reviews",
      subtitle: "Articles, full reviews, and detailed analysis of tierlist peripherals.",
      searchPlaceholder: "Search blog...",
      sortLabel: "Sort by",
      loading: "Loading blog...",
      failedToLoad: "Failed to load posts",
      articleOnBlog: "Article published on the blog",
      tagBlog: "Blog",
      minRead: (count) => `${count} min read`,
      noArticles: "No articles found.",
      comingSoon: "New reviews and analysis will be published soon.",
      articleNotFound: "Article not found.",
      backToBlog: "Back to blog",
      viewTierlist: "View tier list",
      noPeripheral: "No peripheral",
      by: "By",
      relatedVideo: "Related video",
      externalVideo: "External video:",
    },
    offers: {
      title: "Offers",
      livePill: "Live · Sunano Telegram",
      disclaimer: "Messages are published by third parties and may change at any time. Confirm prices before purchasing.",
      refresh: "Refresh",
      join: "Join",
      telegramChannel: "Telegram Channel",
      noMessages: "No messages found",
      tryLater: "Try again later.",
      new: "New",
      offerImage: "Offer image",
      openInTelegram: "Open in Telegram",
      failedToLoad: "Failed to load offers",
      prev: "Prev",
      next: "Next",
      dateFormat: "MMMM dd, yyyy 'at' HH:mm",
    },
    maintenance: {
      mode: "Maintenance Mode",
      title: "We are updating the website",
      body1: "Public content is temporarily unavailable while we perform improvements.",
      body2: "Authenticated administrators continue to have normal access.",
      signInAsAdmin: "Sign in as admin",
      tryAgain: "Try again",
    },
    changelog: {
      title: "Changelog",
      description: "The real history of everything we've built, fixed, and improved on Sunano.",
      entries: [
        {
          version: "v0.2.9",
          date: "August 15",
          title: "Star-rating reviews for peripherals, replacing GOOD OR TRASH",
          description: "The binary \"GOOD OR TRASH?\" vote is gone — peripherals are now rated 1 to 5 stars, and the verdict on the product page is calculated from the community's average rating.",
          items: [
            "New \"My Reviews\" tab in your profile: rate any peripheral in the catalog (1 to 5 stars) with an optional comment",
            "Integrity term: before your first review, you must confirm you actually used the product you're rating — anyone caught rating on hearsay can lose Aura and have reviews removed by Staff",
            "Creating a review credits you Aura, with protection against farming by deleting and recreating the same review",
            "The peripheral page now shows a list of community reviews with rating, comment, author, and tier/streak badges, prioritizing reviewers with more Aura",
            "\"GOOD OR TRASH?\" is no longer a binary vote — it now shows the verdict calculated from the average star rating (good, trash, or tie)",
          ],
        },
        {
          version: "v0.2.8",
          date: "August 13",
          title: "Market, peripheral comments and voting, and Tierlist price bands",
          description: "Bazar became Mercado (a peer-to-peer marketplace), peripherals got comments and \"GOOD OR TRASH?\" voting, the Mouse detail page was reorganized, and the Tierlist's Value tab now groups by price band instead of a fixed tier.",
          items: [
            "Mercado: new peer-to-peer marketplace replacing Bazar — any member can list their own item with an OLX link",
            "Peripheral comments: every peripheral page now has a comments section (same thread/Aura pattern as the Forum) to share your experience and opinion about the product",
            "\"GOOD OR TRASH?\" voting: vote whether you'd recommend a peripheral — the community decides, and voting credits you Aura",
            "Mouse detail page reorganized: \"Average price\" front and center, specs reordered (Latency, Switch, Sensor, Polling Rate, Coating, Trimode, Battery, Battery life), and a new \"Shape\" block with size, dimensions, and a shape photo",
            "Peripheral catalog cards simplified: just tags and the highlighted price, without secondary specs cluttering the card",
            "Tierlist: the \"Value\" tab now groups by price band (Budget/Mid/Premium) instead of a fixed tier, prioritizing items flagged as a SCAM",
            "Fixed: the Tierlist lost its selected tab when going back from a peripheral's detail page (it reset to Keyboard) — the tab now sticks and restores correctly",
            "GIF support in comments, alongside images",
            "Cover and thumbnail image upload for Blog posts",
            "Updated community rules in the Forum sidebar",
          ],
        },
        {
          version: "v0.2.7 · Index Librorum Prohibitorum",
          date: "August 10",
          title: "Offensive content filter, streak Aura bonus, and a public Changelog",
          description: "Display name and bio now go through an automatic offensive-content filter, daily streaks now grant a percentage Aura bonus on everything you earn, and the Changelog is no longer admin-only.",
          items: [
            "Display name and profile bio are checked against a list of offensive terms (profanity, hate speech) on signup and edit — profiles that already had a blocked term were retroactively censored with asterisks and notified via the notification bell",
            "Streak Aura bonus: each consecutive day completing all 3 daily missions raises a percentage multiplier (1.1% to 6%) applied to every positive Aura gain — likes, missions, achievements, and creating posts/comments",
            "The streak badge (profile, mini profile, comments, and directory) now heats up from amber to red as the streak grows, and shows the current bonus on hover",
            "New 'Top Streaks' tab in the People directory, and the ranking lists (Aura, Most Active, Most Visited, Most Followed) now show up to 100 profiles",
            "The /changelog page is no longer admin-only and now shows up in the menu for everyone",
            "The aura-received notification icon switched from purple to orange (matching Aura's color elsewhere on the site), and comment/reply notifications no longer repeat the message text",
            "Terms of use updated (version 2026-08) with the rule about the offensive-content filter",
          ],
        },
        {
          version: "v0.2.6",
          date: "August 9",
          title: "Deeper comment threads and better use of mobile screens",
          description: "Comments now support nested replies at more levels, and several pages got spacing and button tweaks to fit small screens better.",
          items: [
            "Comments now support up to 4 levels of nested replies (up from 1), with decreasing indent so text doesn't get squeezed on narrow screens",
            "Hidden forum posts no longer show the Reply and Share buttons, and their comments display a notice that the post no longer accepts replies",
            "Forum post titles now wrap correctly instead of breaking the layout",
            "Forum action buttons (Delete, Hide/Show, Share) collapse to icon-only on small screens to free up space for content",
            "Spacing on the main pages tightened up to make better use of mobile screens",
            "The 'Forgot your password?' button on the login screen moved to a spot that's easier to find",
          ],
        },
        {
          version: "v0.2.5",
          date: "August 8",
          title: "Achievements, daily streaks, and Events became Achievements",
          description: "New Achievements system with progression across posts, comments, and followers, daily missions with a streak, and the Events page was merged with the new achievements into /conquistas.",
          items: [
            "Track-based achievements (Posts, Comments, Followers) with 5 tiers — Bronze, Silver, Gold, Platinum, and Diamond",
            "Daily missions (post, comment, give aura) with their own TopBar badge and a progress panel",
            "Streak: completing all 3 daily missions keeps the streak alive, shown with a bird badge in the TopBar, on the profile, in the mini profile, and next to the author name on comments",
            "The /eventos page became /conquistas, bringing time-limited events and the new general achievements together in one place",
            "Profile medals now show an 'Event' tag when earned from an event, and the section is leaner (no more slot count)",
            "The mobile avatar menu now includes theme, Aura balance, and streak, freeing up room in the top bar for notifications and missions",
          ],
        },
        {
          version: "v0.2.4",
          date: "August 8",
          title: "Mentions and images in comments",
          description: "You can now tag other people in comments with @ and attach images straight in your reply, on both forum and blog.",
          items: [
            "@ mentions in comments, with autocomplete and a notification for whoever gets tagged",
            "Image uploads on comments, with a preview before you post",
          ],
        },
        {
          version: "v0.2.3",
          date: "August 6",
          title: "Aura back on posts, deleting your own posts/comments, and a more social forum",
          description: "Aura got a direct like button on forum posts, you can now delete your own posts and comments, and the forum sidebar now shows who's most active and who moderates. Profile pages and the People directory got some polish too.",
          items: [
            "Give aura on posts: a like (no dislike) credits the author +1, with a daily cap and no reacting to your own post",
            "Delete your own posts and comments, right from the UI",
            "Hover mini profile on commenters' name/avatar, linking to their profile",
            "Forum sidebar now shows 'Most Active' and 'Moderators' cards, plus a short forum description",
            "'Trending' card on the Home page, spotlighting the post with the most aura this week",
            "Profile: the Posts/Comments card is now two independent buttons, each opening the right modal — the Comments one lists the user's comments, each linking to its post",
            "People directory redesign: name search removed, each tab now has a description, and the Follow button only shows on the 'Most visited' and 'Following' tabs",
            "Peripheral page: when an item is ranked in more than one mode (e.g. a mouse's Overall/Magnetic/Value), you can switch between them right on the page",
            "Language selector moved out of the top bar — now lives in account Preferences",
          ],
        },
        {
          version: "v0.2.2",
          date: "August 5",
          title: "Notifications, comment editing, and Aura tweaks",
          description: "A notification bell landed, comments can now be edited for a short window, and Aura got simpler: reactions now live only on comments.",
          items: [
            "Notification bell up top: aura received, comments on your post, replies, and new followers",
            "Comments can be edited for up to 15 minutes after posting, with bold text support",
            "Like/Dislike reactions removed from posts — they now live only on comments, keeping Aura focused on rewarding posting",
            "Tweaks to social links and the video section's translations",
          ],
        },
        {
          version: "v0.2.1",
          date: "August 5",
          title: "Forum reports and site-wide SEO",
          description: "The forum got post/comment reporting and full-screen image viewing, and the whole site got the SEO fundamentals it was missing to show up better on Google.",
          items: [
            "Report a post or comment in the forum, with a moderation queue for the team to review",
            "Post images now open full-screen, with zoom",
            "Pinned post border is now cleaner and sharper",
            "Site-wide SEO: sharing metadata (Open Graph/Twitter), structured data linking Sunano to its YouTube channel and social accounts, and the home/tierlist/ranking/peripherals pages now have their own title and description",
          ],
        },
        {
          version: "v0.2.0",
          date: "August 5",
          title: "Forum and blog SEO",
          description: "Starting with this version, the changelog switches to semantic versioning (v0.2.0, v0.2.1...), with a more precise record of what changes in each version.",
          items: [
            "Forum posts now server-rendered, with metadata and structured data (JSON-LD) for better Google visibility",
            "Forum category pages are now indexable",
            "New sitemap.xml and robots.txt, covering forum, blog, and static pages",
          ],
        },
        {
          version: "August 2026",
          date: "August 4",
          title: "Aura rebalanced and more in the People directory",
          description: "Quick follow-ups after Alpha: Aura was rebalanced to reward posting, reacting became Like/Dislike and now lives only on comments, and the People directory got a bit more complete.",
          items: [
            "Aura rebalanced: posting gives +10 (once a day) and commenting gives +5 (once per post)",
            "Reactions swapped for Like/Dislike (+1 and -1 aura for the author), now on comments only — posts no longer take reactions, posting itself is what gets rewarded",
            "The forum's Hot tab now ranks topics by how much they're being discussed",
            "Blog/news comments now get thread replies and reactions, same as the forum",
            "People directory got an activity ranking, and the podium now shows a mini banner",
            "Aura ranking now shown on profiles too",
            "Truncated excerpt with a character limit on the news headline card",
            "Tierlist's default rating mode now adapts to the selected category",
          ],
        },
        {
          version: "August 2026",
          date: "August 2",
          title: "Sunano enters Alpha",
          description: "The month opened with the official Alpha launch of Sunano, with a permanent tag at the top of the site, and kept going with updates to events, forum, profiles, and security.",
          items: [
            "Alpha launch, with a permanent tag at the top of the site",
            'Manual and Aura-redeemable event claims, plus "Featured achievements" on the Home page',
            "Forum aura (reactions) system and comment replies, with a share menu on posts",
            'Mini profile on hover, profiles with a stats grid and drag-to-frame photo/banner, "VIP+" badge, and a "Most Aura" ranking in the people directory',
            'Security and LGPD: consent flow with audit logging, email-confirmed account deletion, and "remember this device" for 2FA',
            'New PCB category and "IPS/VA" and "competitive" rating modes on the tierlist',
            "Telegram offers read straight from the public channel, unblocked signup, and clearer login/upload fixes",
          ],
        },
        {
          version: "July 2026",
          date: "July 29",
          title: "Social profiles, likes, and more security",
          description: "The biggest month yet: new social features, tighter security, and performance work across several pages.",
          items: [
            "People directory with a follow system",
            "Like/unlike peripherals, with a limit and persistence",
            "Public profile showcase with medals and setup",
            "Configurable Home banners",
            "Security audit: access policies (RLS), rate limiting, and upload protection",
            "New access-denied page and per-section admin permissions",
            "Redesigned Home page with animated counters",
            "Optimized image transformation usage",
          ],
        },
        {
          version: "June 2026",
          date: "June 30",
          title: "Social login, 2FA, and LGPD compliance",
          description: "A month focused on account security, plus the launch of the Ranking page.",
          items: [
            "Sign in with Google and Discord",
            "Two-factor authentication (2FA)",
            "LGPD compliance, including data export and anonymization",
            "Password recovery and reset",
            "New Ranking page with a score per peripheral",
            '"Mechanical" mode for the keyboard tier list',
          ],
        },
        {
          version: "May 2026",
          date: "May 31",
          title: "Forum, Store & Bazaar, and a visual overhaul",
          description: "The month that laid the groundwork for several sections the site still runs on today.",
          items: [
            "Community forum with posts and comments",
            "Store and Bazaar for used peripherals",
            "Reworked tier system (GOAT, SS, S, A, B, C, L)",
            "Telegram integration for offers",
            "Dark theme",
            "Complete visual restructuring of the site",
          ],
        },
        {
          version: "April 2026",
          date: "April 10",
          title: "The start of Sunano",
          description: "The first version of the site: a gaming peripherals tier list with its own admin panel.",
          items: [
            "Launch of the peripherals tier list",
            "Admin panel",
            "Portuguese and English support",
            "YouTube videos section",
          ],
        },
      ],
    },
    errorPages: {
      notFoundTitle: "This page flew the coop",
      notFoundBody: "We dug through every corner of the site and couldn't find this page. The link might be wrong, or it may have moved.",
      errorTitle: "Oops, something broke",
      errorBody: "Our bird is already working on a fix. Please try again in a moment.",
      errorDigest: (digest) => `Error code: ${digest}`,
      backHome: "Back to Home",
      backDashboard: "Back to Dashboard",
      goBack: "Go back",
      tryAgain: "Try again",
      quickLinks: "Or take a look at:",
      linkPeripherals: "Peripherals",
      linkTierlist: "Tierlist",
      linkBlog: "Blog & Reviews",
      linkForum: "Forum",
    },
  },
}

// Backward compat alias — TopBar.tsx uses I18N[locale].topbar.*
export const I18N = translations
