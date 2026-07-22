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
  nav: {
    home: string
    peripherals: string
    content: string
    shop: string
    news: string
    videos: string
    forum: string
    store: string
    used: string
    offers: string
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
    latestUpdate: { title: string; month: string; description: string }
    viewingBy: string
    comingSoon: string
    comingSoonDesc: string
    noItems: string
    underReview: string
    tierDescriptions: { GOAT: string; SS: string; S: string; A: string; B: string; C: string; L: string }
    tierSubtitles: { GOAT: string; SS: string; S: string; A: string; B: string; C: string; L: string }
    modeDescriptions: { oled: string; overall: string; value: string; soundTyping: string; mechanical: string; magnetic: string; pcb: string; recommended: string }
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
      organizationArea: string
      whatToDo: string
      description: string
      quickShortcuts: string
      quickSummary: string
      usefulTips: string
      addTierListItem: string
      createTierListItem: string
      viewTierList: string
      organizeTierList: string
      writePost: string
      publishUpdates: string
      tierListItems: string
      tierListItemsDesc: (count: number) => string
      contentLabel: string
      contentDesc: string
      visitorExperience: string
      visitorExperienceDesc: string
      tipSimple: string
      tipImages: string
      tipReview: string
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
      bgRemovedAuto: string
      bgBestWithSolid: string
      sectionBasicInfo: string
      category: string
      name: string
      charsHint: string
      brand: string
      selectBrand: string
      brandHint: string
      priceUsd: string
      tierHint: string
      underReview: string
      reviewFlagsLabel: string
      reviewFlagsHint: string
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
      modeDescriptions: { performance: string; value: string; recommended: string; oled: string; soundTyping: string; mechanical: string; magnetic: string; pcb: string }
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
    betaDate: string
    betaTitle: string
    betaDescription: string
    betaItems: string[]
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
    nav: {
      home: "Início",
      peripherals: "Periféricos",
      content: "Conteúdo",
      shop: "Loja",
      news: "Notícias",
      videos: "Vídeos",
      forum: "Fórum",
      store: "Loja",
      used: "Usado",
      offers: "Ofertas",
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
      budgetBand: "Budget (até $80)",
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
        p2: "São bem auto explicativos, por exemplo, uma categoria descrita como \"Custo Benefício\" terá foco maior naqueles periféricos que se destacam mais nessa área e por assim, seu Tier (Rank) será maior devido a importância desse fator ter aumentando sobre essa análise avaliativa",
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
        month: "Abril 2026",
        description: "As listas são atualizadas continuamente com novos lançamentos, revisões de firmware e mudanças de preço.",
      },
      viewingBy: "Voce esta vendo a tierlist ordenada por:",
      comingSoon: "Em Breve",
      comingSoonDesc: "Esta categoria de tierlist está em desenvolvimento e em breve estará disponível. Fique atento!",
      noItems: "Nenhum item encontrado com os filtros atuais.",
      underReview: "Sob Revisão",
      tierDescriptions: { GOAT: "Elite - Referencia absoluta", SS: "Extremo - Quase perfeito", S: "Top - Otima escolha", A: "Muito bom - Consistente e forte", B: "Bom - Opção sólida", C: "Ok - Funciona bem com limites", L: "Inferior - Apenas para casos específicos" },
      tierSubtitles: { GOAT: "Apelão", SS: "Excepcional", S: "Muito bom", A: "Bom", B: "Decente", C: "Usável", L: "Veio Podi" },
      modeDescriptions: { oled: "Mostrando painéis OLED", overall: "Ordenado por desempenho geral", value: "Ordenado por preço", soundTyping: "Ordenado por som e digitação", mechanical: "Ordenado por desempenho puro", magnetic: "Ordenado por desempenho magnético", pcb: "Ordenado por desempenho PCB", recommended: "Escolhas sugeridas por Sunano, priorizando equilibrio geral" },
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
        organizationArea: "Área de organização",
        whatToDo: "O que você quer fazer hoje?",
        description: "Escolha uma ação rápida abaixo para atualizar o site, publicar conteúdo ou revisar o que já está no ar.",
        quickShortcuts: "Atalhos rápidos",
        quickSummary: "Resumo rápido",
        usefulTips: "Dicas úteis",
        addTierListItem: "Adicionar item da Tier List",
        createTierListItem: "Crie um novo item da tier list",
        viewTierList: "Ver Tier List",
        organizeTierList: "Organize o ranking atual",
        writePost: "Escrever post",
        publishUpdates: "Publique novidades e análises",
        tierListItems: "Itens da Tier List",
        tierListItemsDesc: (count) =>
          count === 0
            ? "Nenhum item pendente de revisão."
            : `${count} ${count === 1 ? "item" : "itens"} marcado${count === 1 ? "" : "s"} para revisão ou complemento.`,
        contentLabel: "Conteúdo",
        contentDesc: "Você pode criar novos posts ou atualizar os existentes.",
        visitorExperience: "Experiência do visitante",
        visitorExperienceDesc: "Quando terminar, volte ao site para conferir como ficou para o público.",
        tipSimple: "Mantenha os nomes e descrições simples para facilitar a leitura.",
        tipImages: "Use imagens e textos curtos para deixar a página mais agradável.",
        tipReview: "Revise antes de publicar para evitar retrabalho.",
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
        bgRemovedAuto: "Fundo removido automaticamente.",
        bgBestWithSolid: "Funciona melhor com fundo sólido/branco.",
        sectionBasicInfo: "Informações Básicas",
        category: "Categoria",
        name: "Nome",
        charsHint: "Entre 1 e 200 caracteres",
        brand: "Marca",
        selectBrand: "Selecione uma marca",
        brandHint: "Escolha uma das marcas da lista",
        priceUsd: "Preço (USD)",
        tierHint: "Selecione o tier que melhor representa a performance deste periférico",
        underReview: "Sob Revisão",
        reviewFlagsLabel: "Marcar para revisão",
        reviewFlagsHint: "Marque as frentes que ainda precisam de atenção. O periférico aparece na lista de revisão do dashboard até todas ficarem desmarcadas.",
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
        modeDescriptions: { performance: "Ordenado por desempenho puro", value: "Ordenado por preço", recommended: "Escolhas sugeridas por Sunano, priorizando equilibrio geral", oled: "Apenas painéis OLED", soundTyping: "Ordenado por som e digitação", mechanical: "Ordenado por desempenho puro", magnetic: "Ordenado por desempenho magnético", pcb: "Ordenado por desempenho PCB" },
      },
      tierlistReview: {
        pageTitle: "Revisão de Periféricos",
        pageDescription: "Marque o que falta revisar em cada periférico: Informações Técnicas (Performance), Loja, Vídeo review ou Specs e comentários.",
        backToDashboard: "Dashboard",
        failedToLoad: "Falha ao carregar os periféricos.",
        empty: "Nenhum periférico encontrado.",
        emptyDesc: "Tente ajustar sua busca.",
        searchPlaceholder: "Buscar por nome ou marca...",
        categoryPerformance: "Informações Técnicas (Performance)",
        categoryStore: "Loja",
        categoryVideoReview: "Vídeo review",
        categorySpecsComments: "Specs e comentários",
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
      myProfile: "Meu perfil",
      adminPanel: "Painel admin",
      signOut: "Sair",
      settings: "Configurações",
    },
    blog: {
      title: "Reviews",
      subtitle: "Artigos, reviews completos e analises detalhadas dos periféricos da tierlist.",
      searchPlaceholder: "Buscar no blog...",
      sortLabel: "Ordenar por",
      loading: "Carregando blog...",
      failedToLoad: "Erro ao carregar posts",
      articleOnBlog: "Artigo publicado no blog",
      tagBlog: "Blog",
      minRead: (count) => `${count} min de leitura`,
      noArticles: "Nenhum artigo encontrado.",
      comingSoon: "Novos reviews e analises serao publicados em breve.",
      articleNotFound: "Artigo não encontrado.",
      backToBlog: "Voltar ao blog",
      viewTierlist: "Ver tierlist",
      noPeripheral: "Sem periférico",
      by: "Por",
      relatedVideo: "Video relacionado",
      externalVideo: "Video externo:",
    },
    offers: {
      title: "Ofertas",
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
      description: "Apenas a versao beta atual em construcao.",
      betaDate: "Em construção",
      betaTitle: "Beta em andamento",
      betaDescription: "Versao beta atual da plataforma, sendo refinada antes do primeiro release estavel.",
      betaItems: [
        "Layout beta em refinamento",
        "Ajustes de tierlist, admin e navegacao em andamento",
        "Melhorias visuais e de consistencia ainda sendo aplicadas",
        "Base preparada para evoluir para o primeiro release estavel",
      ],
    },
  },

  "en-US": {
    topbar: {
      languageLabel: "Language",
      languageHelper: "Choose the interface language",
      themeLabel: "Theme",
      themeHelper: "Pick a color mood",
    },
    nav: {
      home: "Home",
      peripherals: "Peripherals",
      content: "Content",
      shop: "Shop",
      news: "News",
      videos: "Videos",
      forum: "Forum",
      store: "Store",
      used: "Used",
      offers: "Offers",
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
      budgetBand: "Budget (up to $80)",
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
        p2: "They're pretty self-explanatory — for example, a category described as \"Cost-Benefit\" will focus more on peripherals that stand out in that area, and so its Tier (Rank) will be higher since that factor carries more weight in that particular evaluation.",
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
        month: "April 2026",
        description: "Lists are updated continuously based on new releases, firmware revisions, and market price changes.",
      },
      viewingBy: "You are viewing the tierlist sorted by:",
      comingSoon: "Coming Soon",
      comingSoonDesc: "This tierlist category is under development and will be available soon. Stay tuned!",
      noItems: "No items found with the current filters.",
      underReview: "Under Review",
      tierDescriptions: { GOAT: "Elite - Absolute reference", SS: "Extreme - Almost perfect", S: "Top - Great choice", A: "Very good - Strong and consistent", B: "Good - Solid option", C: "Okay - Works well with tradeoffs", L: "Lower - Only for niche cases" },
      tierSubtitles: { GOAT: "", SS: "", S: "", A: "", B: "", C: "", L: "" },
      modeDescriptions: { oled: "Showing OLED panels", overall: "Sorted by overall performance", value: "Sorted by price", soundTyping: "Sorted by sound and typing feel", mechanical: "Sorted by mechanical performance", magnetic: "Sorted by magnetic performance", pcb: "Sorted by PCB performance", recommended: "Suggested picks by Sunano, prioritizing overall balance" },
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
        organizationArea: "Organization area",
        whatToDo: "What do you want to do today?",
        description: "Choose a quick action below to update the site, publish content, or review what is already live.",
        quickShortcuts: "Quick shortcuts",
        quickSummary: "Quick summary",
        usefulTips: "Useful tips",
        addTierListItem: "Add Tier List item",
        createTierListItem: "Create a new tier list item",
        viewTierList: "View Tier List",
        organizeTierList: "Organize the current ranking",
        writePost: "Write post",
        publishUpdates: "Publish updates and analysis",
        tierListItems: "Tier List items",
        tierListItemsDesc: (count) =>
          count === 0
            ? "No items pending review."
            : `${count} ${count === 1 ? "item" : "items"} flagged for review or follow-up.`,
        contentLabel: "Content",
        contentDesc: "You can create new posts or update existing ones.",
        visitorExperience: "Visitor experience",
        visitorExperienceDesc: "When done, return to the site to review the public experience.",
        tipSimple: "Keep names and descriptions simple for better readability.",
        tipImages: "Use images and short text to keep pages cleaner.",
        tipReview: "Review before publishing to avoid rework.",
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
        bgRemovedAuto: "Background removed automatically.",
        bgBestWithSolid: "Works best with solid/white backgrounds.",
        sectionBasicInfo: "Basic Info",
        category: "Category",
        name: "Name",
        charsHint: "1-200 characters",
        brand: "Brand",
        selectBrand: "Select a brand",
        brandHint: "Pick from the list above",
        priceUsd: "Price (USD)",
        tierHint: "Select the tier that best represents this peripheral's performance",
        underReview: "Under Review",
        reviewFlagsLabel: "Flag for review",
        reviewFlagsHint: "Flag the areas that still need attention. The peripheral shows up in the dashboard's review list until every flag is cleared.",
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
        modeDescriptions: { performance: "Sorted by pure performance", value: "Sorted by price", recommended: "Suggested picks by Sunano, prioritizing overall balance", oled: "Show only OLED panels", soundTyping: "Sorted by sound and typing feel", mechanical: "Sorted by mechanical performance", magnetic: "Sorted by magnetic performance", pcb: "Sorted by PCB performance" },
      },
      tierlistReview: {
        pageTitle: "Peripheral Review",
        pageDescription: "Flag what's missing per peripheral: Technical Info (Performance), Store, Video review, or Specs & comments.",
        backToDashboard: "Dashboard",
        failedToLoad: "Failed to load peripherals.",
        empty: "No peripherals found.",
        emptyDesc: "Try adjusting your search.",
        searchPlaceholder: "Search by name or brand...",
        categoryPerformance: "Technical Info (Performance)",
        categoryStore: "Store",
        categoryVideoReview: "Video review",
        categorySpecsComments: "Specs & comments",
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
      myProfile: "My profile",
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
      description: "Only the current beta version is under construction.",
      betaDate: "In progress",
      betaTitle: "Beta ongoing",
      betaDescription: "Current beta version of the platform, being refined before the first stable release.",
      betaItems: [
        "Beta layout under refinement",
        "Tierlist, admin, and navigation improvements in progress",
        "Visual and consistency improvements still being applied",
        "Foundation ready to evolve into the first stable release",
      ],
    },
  },
}

// Backward compat alias — TopBar.tsx uses I18N[locale].topbar.*
export const I18N = translations
